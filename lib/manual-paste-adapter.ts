import type { SearchAdapter, SearchResult } from "@/lib/types";

export class ManualPasteAdapter implements SearchAdapter {
  provider = "manual_paste" as const;

  constructor(
    private readonly idea: string,
    private readonly pastedContent: string
  ) {}

  async search(): Promise<SearchResult[]> {
    return [
      {
        title: `用户粘贴内容：${this.idea.slice(0, 32)}`,
        platform: "user_paste",
        snippet: this.pastedContent.slice(0, 260),
        rawContent: this.pastedContent
      }
    ];
  }
}
