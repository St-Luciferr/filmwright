"use client";

import { Loader2, SendHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { JobEvent } from "@filmwright/engine/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { postJson } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Turn a raw tool call into something a person can skim.
 *
 * The raw feed is a firehose of `Write /long/absolute/path` lines. What someone
 * watching actually wants to know is "which frame is it on" and "is it rendering
 * yet", so the mapping below is by intent rather than by tool name.
 */
export function describeTool(message: string): { verb: string; detail: string } {
  const [rawName, ...rest] = message.split(" — ");
  const name = rawName ?? "";
  const arg = rest.join(" — ");
  const base = arg.split("/").filter(Boolean).pop() ?? arg;

  if (name === "Bash") {
    const cmd = arg;
    if (/hyperframes\b[^|]*\brender\b|npm run render/.test(cmd))
      return { verb: "Rendering", detail: "" };
    if (/hyperframes\b[^|]*\bcheck\b|npm run check/.test(cmd))
      return { verb: "Checking composition", detail: "" };
    if (/hyperframes\b[^|]*\bcapture\b/.test(cmd))
      return { verb: "Capturing the site", detail: "" };
    if (/hyperframes\b[^|]*\b(snapshot|thumbnail)\b/.test(cmd))
      return { verb: "Taking a snapshot", detail: "" };
    if (/\btts\b|voice|kokoro/i.test(cmd))
      return { verb: "Generating voiceover", detail: "" };
    if (/\bbgm\b|music/i.test(cmd))
      return { verb: "Sourcing music", detail: "" };
    if (/\bsfx\b/i.test(cmd)) return { verb: "Sourcing sound effects", detail: "" };
    if (/^(ls|cat|head|tail|find|grep|rg|wc|pwd)\b/.test(cmd))
      return { verb: "Looking around", detail: "" };
    return { verb: "Ran", detail: cmd.slice(0, 90) };
  }

  if (name === "Write" || name === "Edit" || name === "MultiEdit") {
    const verb = name === "Write" ? "Wrote" : "Edited";
    if (/compositions\/frames\//.test(arg))
      return { verb: `${verb} frame`, detail: base.replace(/\.html$/, "") };
    if (/captions/.test(arg)) return { verb: `${verb} captions`, detail: "" };
    if (/index\.html$/.test(arg)) return { verb: `${verb} the timeline`, detail: "" };
    return { verb, detail: base };
  }

  if (name === "Read") return { verb: "Read", detail: base };
  if (name === "Skill") return { verb: "Loaded skill", detail: arg };
  if (name === "Task" || name === "Agent")
    return { verb: "Delegated", detail: arg.slice(0, 70) };
  if (name === "TodoWrite") return { verb: "Updated its plan", detail: "" };
  if (name.startsWith("mcp__studio__ask"))
    return { verb: "Asked you a question", detail: "" };
  if (name.startsWith("mcp__studio__request_review"))
    return { verb: "Requested your review", detail: "" };
  if (name === "Glob" || name === "Grep")
    return { verb: "Searched", detail: arg.slice(0, 60) };

  return { verb: name, detail: arg.slice(0, 70) };
}

const ICON: Record<JobEvent["kind"], string> = {
  log: "·",
  tool: "›",
  stage: "◆",
  error: "✘",
  usage: "$",
  ask: "?",
  answer: "✔",
  steer: "▸",
};

/** Colour carries the same information as the glyph, for skimming. */
const KIND_STYLE: Partial<Record<JobEvent["kind"], string>> = {
  error: "text-err",
  stage: "text-accent",
  usage: "text-warn",
  ask: "text-warn",
  answer: "text-accent",
  steer: "text-info",
  tool: "text-subtle",
};

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour12: false });

/** Events worth reading if you are following along rather than debugging. */
const STORY: JobEvent["kind"][] = [
  "log",
  "stage",
  "error",
  "usage",
  "ask",
  "answer",
  "steer",
];

function useStickyScroll(dep: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [dep]);

  return ref;
}

export function Activity({
  jobId,
  events,
  live,
  canSteer,
}: {
  jobId: string;
  events: JobEvent[];
  live: boolean;
  canSteer: boolean;
}) {
  const toast = useToast();
  const [everything, setEverything] = useState(false);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

  const shown = everything ? events : events.filter((e) => STORY.includes(e.kind));
  const listRef = useStickyScroll(shown.length);

  // In story view the tool firehose is hidden, so surface the most recent one
  // as a single live line — otherwise long silent stretches look like a hang.
  const lastTool = [...events].reverse().find((e) => e.kind === "tool");
  const current = lastTool ? describeTool(lastTool.message) : null;

  async function sendNote(e: React.FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    setSending(true);
    try {
      await postJson(
        `/api/jobs/${jobId}/steer`,
        { text: note },
        "The studio would not take that note.",
      );
      setNote("");
    } catch (err) {
      // Keep the text in the box: a note the run never received should not
      // disappear as though it had been delivered.
      toast.push(
        "error",
        "Note not sent",
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 px-1 pb-3">
        <Tabs
          value={everything ? "all" : "story"}
          onValueChange={(v) => setEverything(v === "all")}
        >
          <TabsList>
            <TabsTrigger value="story">Story</TabsTrigger>
            <TabsTrigger value="all">Everything</TabsTrigger>
          </TabsList>
        </Tabs>
        <span className="tabular text-[12px] text-subtle">
          {shown.length} event{shown.length === 1 ? "" : "s"}
        </span>
      </div>

      {live && current && !everything && (
        <div className="mb-2 flex items-center gap-2 rounded-control border border-info/25 bg-info-dim/40 px-3 py-2 text-[13px] text-info">
          <Loader2 className="size-3.5 shrink-0 animate-spin" />
          <span className="truncate">
            {current.verb}
            {current.detail && <b className="font-medium text-fg"> {current.detail}</b>}
          </span>
        </div>
      )}

      <div
        ref={listRef}
        className="min-h-0 flex-1 overflow-y-auto rounded-control border border-line bg-inset p-2 font-mono text-[12px] leading-relaxed"
      >
        {shown.length === 0 && (
          <p className="px-2 py-8 text-center font-sans text-[13px] text-subtle">
            {live ? "Waiting for the worker…" : "Nothing recorded."}
          </p>
        )}
        {shown.map((e, i) => {
          const tool = e.kind === "tool" ? describeTool(e.message) : null;
          return (
            <div
              key={i}
              className={cn(
                "flex gap-2 rounded px-1.5 py-1",
                KIND_STYLE[e.kind] ?? "text-muted",
              )}
            >
              <span className="tabular shrink-0 text-subtle">{time(e.at)}</span>
              <span className="shrink-0 select-none opacity-70" aria-hidden>
                {ICON[e.kind]}
              </span>
              <span className="min-w-0 whitespace-pre-wrap break-words">
                {tool ? (
                  <>
                    {tool.verb}
                    {tool.detail && <b className="font-medium text-fg"> {tool.detail}</b>}
                  </>
                ) : (
                  e.message
                )}
              </span>
            </div>
          );
        })}
      </div>

      {canSteer && (
        <form className="mt-2 flex gap-2" onSubmit={sendNote}>
          <Input
            value={note}
            onChange={(ev) => setNote(ev.target.value)}
            placeholder="Send a note to the run — e.g. “make beat 3 land harder”"
            aria-label="Note to the running job"
          />
          <Button
            type="submit"
            variant="secondary"
            loading={sending}
            disabled={!note.trim()}
          >
            <SendHorizontal />
            Send
          </Button>
        </form>
      )}
    </div>
  );
}
