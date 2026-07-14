import { spawn } from "node:child_process";

export async function runPostgresCommand(command: string, args: string[], databaseUrl: string) {
  const parsed = new URL(databaseUrl);
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  const childEnv = {
    ...process.env,
    PGHOST: parsed.hostname,
    PGPORT: parsed.port || "5432",
    PGUSER: decodeURIComponent(parsed.username),
    PGPASSWORD: decodeURIComponent(parsed.password),
    PGDATABASE: databaseName,
    PGSSLMODE: parsed.searchParams.get("sslmode") ?? process.env.PGSSLMODE
  };
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", env: childEnv });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(Object.assign(new Error(`${command.toUpperCase()}_FAILED`), { code: `${command.toUpperCase()}_${code}` }))
    );
  });
}
