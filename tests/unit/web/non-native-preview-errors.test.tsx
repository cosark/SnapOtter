// @vitest-environment jsdom

import { en } from "@snapotter/shared";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/analytics", async () => {
  const { analyticsModuleMock } = await import("../../helpers/mock-analytics.js");
  return analyticsModuleMock();
});

import { NonNativePreview } from "@/components/common/non-native-preview";
import { captureHandledError } from "@/lib/analytics";

// #1280: every failed preview used to land in the same "Preview generation
// failed" state with nothing logged, so an upload over the size limit looked
// like a broken file and a server fault left no trace.
describe("NonNativePreview failure states", () => {
  beforeEach(() => {
    vi.mocked(captureHandledError).mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  function generateWith(fetchImpl: () => Promise<Response>) {
    vi.stubGlobal("fetch", vi.fn(fetchImpl));
    render(
      <NonNativePreview
        file={new File(["x"], "clip.mkv")}
        filename="clip.mkv"
        fileSize={1}
        modality="video"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: en.toolPage.generatePreview }));
  }

  it("says the file is too large on a 413, and doesn't report it", async () => {
    generateWith(async () => new Response(JSON.stringify({ error: "x" }), { status: 413 }));

    expect(await screen.findByText(en.errors.fileTooLarge)).toBeTruthy();
    expect(screen.queryByText(en.toolPage.previewFailed)).toBeNull();
    // The same file hits the same limit, so no Retry.
    expect(screen.queryByRole("button", { name: en.common.retry })).toBeNull();
    expect(captureHandledError).not.toHaveBeenCalled();
  });

  it("reports a server fault and shows the generic failure", async () => {
    generateWith(async () => new Response("", { status: 500 }));

    expect(await screen.findByText(en.toolPage.previewFailed)).toBeTruthy();
    expect(screen.getByRole("button", { name: en.common.retry })).toBeTruthy();
    expect(captureHandledError).toHaveBeenCalledTimes(1);
  });

  it("reports a network failure", async () => {
    generateWith(async () => {
      throw new TypeError("Failed to fetch");
    });

    expect(await screen.findByText(en.toolPage.previewFailed)).toBeTruthy();
    expect(captureHandledError).toHaveBeenCalledTimes(1);
  });

  it("doesn't report an undecodable file (422)", async () => {
    generateWith(async () => new Response("", { status: 422 }));

    expect(await screen.findByText(en.toolPage.previewFailed)).toBeTruthy();
    expect(captureHandledError).not.toHaveBeenCalled();
  });
});
