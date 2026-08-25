"use client";

import { useEffect, useRef, useState } from "react";
import type { JobEvent } from "@videos/engine/types";

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
  const [everything, setEverything] = useState(false);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

  const shown = everything
    ? events
    : events.filter((e) => STORY.includes(e.kind));
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
      await fetch(`/api/jobs/${jobId}/steer`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: note }),
      });
      setNote("");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="activity">
      <div className="activity-bar">
        <h2 className="section" style={{ margin: 0 }}>
          Activity
        </h2>
        <div className="seg">
          <button
            className={everything ? "" : "on"}
            onClick={() => setEverything(false)}
          >
            Story
          </button>
          <button
            className={everything ? "on" : ""}
            onClick={() => setEverything(true)}
          >
            Everything
          </button>
        </div>
      </div>

      {live && current && !everything && (
        <div className="now">
          <i className="spin" />
          <span>
            {current.verb}
            {current.detail && <b> {current.detail}</b>}
          </span>
        </div>
      )}

      <div className="feed" ref={listRef}>
        {shown.length === 0 && (
          <div className="feed-empty">
            {live ? "Waiting for the worker…" : "Nothing recorded."}
          </div>
        )}
        {shown.map((e, i) => {
          const tool = e.kind === "tool" ? describeTool(e.message) : null;
          return (
            <div key={i} className={`line ${e.kind}`}>
              <span className="t">{time(e.at)}</span>
              <span className="i">{ICON[e.kind]}</span>
              <span className="m">
                {tool ? (
                  <>
                    {tool.verb}
                    {tool.detail && <b> {tool.detail}</b>}
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
        <form className="composer" onSubmit={sendNote}>
          <input
            type="text"
            value={note}
            onChange={(ev) => setNote(ev.target.value)}
            placeholder="Send a note to the run — e.g. “make beat 3 land harder”"
          />
          <button className="ghost" disabled={sending || !note.trim()}>
            {sending ? "…" : "Send"}
          </button>
        </form>
      )}
    </div>
  );
}
