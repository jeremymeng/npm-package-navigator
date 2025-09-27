import * as vscode from "vscode";

export type LogLevel = "info" | "warn" | "error" | "debug";

export class Logger implements vscode.Disposable {
  private readonly channel: vscode.OutputChannel;
  private readonly debugEnabled: boolean;

  constructor(name: string) {
    this.channel = vscode.window.createOutputChannel(name);
    this.debugEnabled = vscode.workspace.getConfiguration("npmPackageNavigator").get<boolean>(
      "debugLogging",
      false,
    );
  }

  info(message: string, ...details: unknown[]): void {
    this.log("info", message, details);
  }

  warn(message: string, ...details: unknown[]): void {
    this.log("warn", message, details);
  }

  error(message: string, error?: unknown): void {
    const details = error ? [error] : [];
    this.log("error", message, details);
  }

  debug(message: string, ...details: unknown[]): void {
    if (!this.debugEnabled) {
      return;
    }

    this.log("debug", message, details);
  }

  dispose(): void {
    this.channel.dispose();
  }

  private log(level: LogLevel, message: string, details: unknown[]): void {
    const timestamp = new Date().toISOString();
    this.channel.appendLine(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
    for (const detail of details) {
      this.channel.appendLine(this.serialize(detail));
    }
  }

  private serialize(value: unknown): string {
    if (value instanceof Error) {
      return `${value.name}: ${value.message}\n${value.stack ?? ""}`.trim();
    }

    if (typeof value === "object") {
      try {
        return JSON.stringify(value, undefined, 2);
      } catch (_error) {
        return String(value);
      }
    }

    return String(value);
  }
}
