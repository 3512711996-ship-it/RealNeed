"use client";

import { useEffect, useRef, useState } from "react";

const labelMap: Record<string, string> = {
  scan: "SCAN",
  open: "OPEN",
  copy: "COPY",
  view: "VIEW",
  evidence: "PROOF",
  pay: "支持",
  action: "DO"
};

const interactiveSelector = [
  "a",
  "button",
  "[role='button']",
  "[data-cursor]",
  "[data-cursor-magnetic]",
  "input[type='submit']"
].join(",");

const nativeCursorSelector = ["input", "textarea", "select", "[contenteditable='true']", "pre", "code"].join(",");

export function CustomCursor() {
  const dotRef = useRef<HTMLDivElement | null>(null);
  const ringRef = useRef<HTMLDivElement | null>(null);
  const labelRef = useRef<HTMLSpanElement | null>(null);
  const target = useRef({ x: 0, y: 0 });
  const dot = useRef({ x: 0, y: 0 });
  const ring = useRef({ x: 0, y: 0 });
  const frame = useRef<number | null>(null);
  const pulseTimeout = useRef<number | null>(null);
  const pressed = useRef(false);
  const paused = useRef(false);
  const currentElement = useRef<HTMLElement | null>(null);
  const currentMagnetic = useRef<HTMLElement | null>(null);
  const currentLabel = useRef("");
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const canUse =
      window.matchMedia("(hover: hover) and (pointer: fine)").matches &&
      window.matchMedia("(prefers-reduced-motion: no-preference)").matches &&
      window.innerWidth >= 768;

    if (!canUse) return;

    setEnabled(true);
    document.body.classList.add("custom-cursor-enabled");

    const setVisible = (visible: boolean) => {
      dotRef.current?.classList.toggle("is-visible", visible);
      ringRef.current?.classList.toggle("is-visible", visible);
    };

    const setLabel = (label: string) => {
      if (currentLabel.current === label) return;
      currentLabel.current = label;
      if (labelRef.current) labelRef.current.textContent = label;
      ringRef.current?.classList.toggle("has-label", Boolean(label));
    };

    const resetMagnetic = () => {
      if (!currentMagnetic.current) return;
      currentMagnetic.current.style.setProperty("--magnetic-x", "0px");
      currentMagnetic.current.style.setProperty("--magnetic-y", "0px");
      currentMagnetic.current = null;
    };

    const setInteractiveElement = (element: HTMLElement | null) => {
      if (currentElement.current === element) return;
      resetMagnetic();
      currentElement.current = element;

      const disabled = Boolean(element?.matches("button:disabled, [aria-disabled='true']"));
      const cursor = element?.dataset.cursor;
      const label = disabled ? "NOT" : cursor ? labelMap[cursor] ?? "" : "";

      ringRef.current?.classList.toggle("is-hover", Boolean(element));
      ringRef.current?.classList.toggle("is-disabled", disabled);
      dotRef.current?.classList.toggle("is-hover", Boolean(element));
      setLabel(label);
    };

    const updateTheme = (eventTarget: EventTarget | null) => {
      const element = eventTarget instanceof HTMLElement ? eventTarget.closest<HTMLElement>("[data-cursor-theme]") : null;
      const theme = element?.dataset.cursorTheme === "dark" ? "dark" : "light";
      if (dotRef.current) dotRef.current.dataset.theme = theme;
      if (ringRef.current) ringRef.current.dataset.theme = theme;
    };

    const onMove = (event: MouseEvent) => {
      target.current = { x: event.clientX, y: event.clientY };

      const rawTarget = event.target as HTMLElement | null;
      if (rawTarget?.closest(nativeCursorSelector)) {
        setVisible(false);
        setInteractiveElement(null);
        return;
      }

      setVisible(true);
      updateTheme(rawTarget);

      const element = rawTarget?.closest<HTMLElement>(interactiveSelector) ?? null;
      const disabled = Boolean(element?.matches("button:disabled, [aria-disabled='true']"));
      setInteractiveElement(element);

      if (element?.dataset.cursorMagnetic === "true" && !disabled) {
        currentMagnetic.current = element;
        const rect = element.getBoundingClientRect();
        const strength = Number(element.dataset.cursorStrength ?? 0.12);
        const maxOffset = 6;
        const offsetX = clamp((event.clientX - (rect.left + rect.width / 2)) * strength, -maxOffset, maxOffset);
        const offsetY = clamp((event.clientY - (rect.top + rect.height / 2)) * strength, -maxOffset, maxOffset);
        element.style.setProperty("--magnetic-x", `${offsetX}px`);
        element.style.setProperty("--magnetic-y", `${offsetY}px`);
      } else {
        resetMagnetic();
      }
    };

    const onLeave = () => {
      setVisible(false);
      setInteractiveElement(null);
    };

    const onEnter = () => setVisible(true);

    const onDown = () => {
      pressed.current = true;
      ringRef.current?.classList.add("is-pressed");
      dotRef.current?.classList.add("is-pressed");
    };

    const onUp = () => {
      pressed.current = false;
      ringRef.current?.classList.remove("is-pressed");
      dotRef.current?.classList.remove("is-pressed");
      ringRef.current?.classList.add("is-pulse");
      if (pulseTimeout.current) window.clearTimeout(pulseTimeout.current);
      pulseTimeout.current = window.setTimeout(() => ringRef.current?.classList.remove("is-pulse"), 260);
    };

    const tick = () => {
      if (!paused.current) {
        dot.current.x = lerp(dot.current.x, target.current.x, 0.35);
        dot.current.y = lerp(dot.current.y, target.current.y, 0.35);

        let ringTargetX = target.current.x;
        let ringTargetY = target.current.y;
        if (currentMagnetic.current) {
          const rect = currentMagnetic.current.getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;
          ringTargetX = target.current.x + (centerX - target.current.x) * 0.22;
          ringTargetY = target.current.y + (centerY - target.current.y) * 0.22;
        }

        ring.current.x = lerp(ring.current.x, ringTargetX, 0.14);
        ring.current.y = lerp(ring.current.y, ringTargetY, 0.14);

        if (dotRef.current) {
          dotRef.current.style.transform = `translate3d(${dot.current.x}px, ${dot.current.y}px, 0)`;
        }

        if (ringRef.current) {
          ringRef.current.style.transform = `translate3d(${ring.current.x}px, ${ring.current.y}px, 0) translate(-50%, -50%)`;
        }
      }

      frame.current = window.requestAnimationFrame(tick);
    };

    const onVisibilityChange = () => {
      paused.current = document.hidden;
      if (document.hidden) setVisible(false);
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mouseleave", onLeave);
    window.addEventListener("mouseenter", onEnter);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    document.addEventListener("visibilitychange", onVisibilityChange);
    frame.current = window.requestAnimationFrame(tick);

    return () => {
      document.body.classList.remove("custom-cursor-enabled");
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("mouseenter", onEnter);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup", onUp);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      resetMagnetic();
      if (frame.current) window.cancelAnimationFrame(frame.current);
      if (pulseTimeout.current) window.clearTimeout(pulseTimeout.current);
    };
  }, []);

  if (!enabled) return null;

  return (
    <>
      <div ref={dotRef} className="cursor-dot" data-theme="light" />
      <div ref={ringRef} className="cursor-ring" data-theme="light">
        <span ref={labelRef} />
      </div>
    </>
  );
}

function lerp(start: number, end: number, amount: number) {
  return start + (end - start) * amount;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
