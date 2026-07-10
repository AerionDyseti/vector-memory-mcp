/**
 * Theme controls how tagged markup renders: colors on/off.
 *
 * Default is ON — hook scripts don't write to a TTY (stdout is a pipe to
 * Claude Code), but Claude Code renders the emitted ANSI. The usual TTY
 * auto-detect would disable colors here, which is exactly backwards.
 *
 * Honored env vars:
 *   - NO_COLOR (any non-empty value) → colors off
 *   - FORCE_COLOR=0                  → colors off
 *
 * `setTheme` lets hook authors override explicitly.
 */
interface Theme {
    colors: boolean;
}
declare function setTheme(override: Partial<Theme>): void;
declare function currentTheme(): Theme;

/**
 * Canonical names for colors and text modifiers.
 *
 * Exported as `as const` tuples so callers can both type-check against the
 * union AND iterate the values (e.g. to build a picker). Adding a new color
 * here forces every code map (FG/BG in tags.ts) to also cover it.
 */
declare const COLORS: readonly ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white", "gray", "grey"];
type ColorName = typeof COLORS[number];
declare const MODIFIERS: readonly ["bold", "dim", "italic", "underline"];
type ModifierName = typeof MODIFIERS[number];

/**
 * OutputBuilder — a tiny accumulator for formatted text.
 *
 * Append strings (optionally containing tag markup). Call `render()` (or
 * `toString()`) to get the final ANSI-rendered string. Tags are resolved
 * against the current theme at render time, not at append time — so you can
 * `setTheme()` anywhere before emit and still get the right output.
 *
 * Structural helpers (boxes, tables, lists) will layer on later.
 */

interface ListOptions {
    bullet?: string;
    indent?: number;
}
interface DividerOptions {
    width?: number;
    color?: ColorName;
}
interface BoxOptions {
    title?: string;
    color?: ColorName;
    padding?: number;
}
interface TableOptions {
    headers?: readonly string[];
    color?: ColorName;
}
declare class OutputBuilder {
    private content;
    append(text: string): this;
    appendLine(text?: string): this;
    /**
     * Append a divider line — `char` repeated as many complete copies as fit
     * in the terminal width (partial trailing copies are not emitted).
     *
     * Width resolution order: `opts.width` → `$COLUMNS` env var →
     * `process.stderr.columns` → 80. We probe stderr, not stdout: in hook
     * scripts stdout is piped to Claude Code, but stderr usually stays
     * attached to the terminal so its `.columns` is the real TTY width.
     * Values ≤ 20 are treated as garbage and fall through to 80.
     *
     * `char` may be multi-cell (emoji, wide glyphs) or contain tag markup —
     * `visualWidth` is used to count cells, so the math stays honest.
     */
    appendDivider(char?: string, opts?: DividerOptions): this;
    /**
     * Append items as a bulleted list, one per line.
     *
     * Items may contain tag markup — it resolves at render time like any other
     * appended text. Multi-line item strings are not reflowed; the caller owns
     * that.
     */
    appendList(items: readonly string[], opts?: ListOptions): this;
    /**
     * Wrap content in a unicode-drawn box.
     *
     *   ┌─ Title ──────┐
     *   │  line one    │
     *   │  line two    │
     *   └──────────────┘
     *
     * Content may be multi-line and may contain tag markup — width math uses
     * `visualWidth`, so ANSI, CJK, and emoji widths are all counted correctly.
     * A single trailing newline on `content` is dropped so `box('hi\n')`
     * doesn't produce an empty bottom row.
     */
    appendBox(content: string, opts?: BoxOptions): this;
    /**
     * Render a table. Each row is an array of cell strings (may contain tag
     * markup). Column widths auto-size to the widest cell across header + rows.
     *
     *   ┌────┬─────┐
     *   │ H1 │ H2  │
     *   ├────┼─────┤
     *   │ a  │ bb  │
     *   │ cc │ ddd │
     *   └────┴─────┘
     *
     * Ragged rows are OK — missing cells render as empty. If there are no
     * rows and no headers, the call is a no-op.
     */
    appendTable(rows: readonly (readonly string[])[], opts?: TableOptions): this;
    render(theme?: Theme): string;
    toString(): string;
    get isEmpty(): boolean;
}

/**
 * Shared emit-side helpers used by every event's `emitOutput`.
 *
 * - `asString(body)`: accept a string or a built-up `OutputBuilder`, return
 *   a plain string. Used for `toUser` / `toClaude` options.
 *
 * - `CommonEmitOptions` / `CommonJsonOutput`: the fields every Claude Code
 *   hook supports at the top level of the output JSON.
 *
 * - `mixinCommon(out, opts)`: apply those top-level common fields from an
 *   options object onto an output payload. Each event's `emitOutput` calls
 *   this first, then layers its event-specific fields on top.
 */

interface CommonEmitOptions {
    /** Shown to the user in the Claude Code UI. Maps to `systemMessage`. */
    toUser?: string | OutputBuilder;
    /** Default true. Setting false tells Claude to stop entirely. */
    continue?: boolean;
    /** Shown when `continue: false`. */
    stopReason?: string;
    /** If true, hide the hook's stdout from the transcript. */
    suppressOutput?: boolean;
}

declare const HOOK_EVENT_NAMES: readonly ["PreToolUse", "PostToolUse", "UserPromptSubmit", "SessionStart", "SessionEnd", "Stop", "SubagentStop", "Notification", "PreCompact"];
type HookEventName = typeof HOOK_EVENT_NAMES[number];
type DecisionType = 'allow' | 'deny' | 'ask';
/**
 * Common fields every hook receives. Keys match the Claude Code hook spec
 * verbatim (snake_case) so what you read in the docs is what you type.
 */
interface CommonHookInput {
    hook_event_name: HookEventName;
    session_id: string;
    transcript_path: string;
    cwd: string;
    permission_mode?: string;
}

/**
 * Shared stdin read + event-name validation for all hook events.
 *
 * Each event's static `parse()` calls `readHookInput('PreToolUse')` to get a
 * validated raw payload, typed so `hook_event_name` is narrowed to the
 * expected literal. Field keys stay snake_case — they match the Claude Code
 * hook spec verbatim, so what you read in the docs is what you type.
 *
 * Parse failures throw `HookParseError`. It carries the would-be exit code
 * (2) and a human-readable message so callers can handle it however they
 * like — write to stderr and exit, turn it into a different signal, swallow
 * it in tests, etc.
 */

type RawHookInput<N extends HookEventName> = CommonHookInput & {
    hook_event_name: N;
};
/**
 * Thrown when `readHookInput` can't produce a valid payload for the expected
 * event. The message is user-facing; `exitCode` is the hook-protocol signal
 * a top-level runner should relay to the OS.
 */
declare class HookParseError extends Error {
    readonly parseError: string;
    readonly exitCode: 2;
    constructor(parseError: string);
}

/**
 * Notification — runs when Claude Code wants to notify the user (permission
 * prompt, idle, auth success, elicitation). Observational; the only output
 * is a user-facing `systemMessage`.
 */

interface NotificationInput extends RawHookInput<'Notification'> {
    message: string;
    title?: string;
    notification_type: 'permission_prompt' | 'idle_prompt' | 'auth_success' | 'elicitation_dialog';
}
type NotificationEmitOptions = CommonEmitOptions;
declare class Notification {
    static parse(): NotificationInput;
    static emitOutput(opts?: NotificationEmitOptions): never;
}

/**
 * PostToolUse — runs after a tool has finished.
 *
 * Typical use: inspect `tool_response` and either let the result through
 * unchanged or tell Claude to treat it as failed (`deny: true`) with a
 * `reason` so the model knows why.
 */

interface PostToolUseInput extends RawHookInput<'PostToolUse'> {
    tool_name: string;
    tool_input: Record<string, unknown>;
    tool_response: unknown;
    tool_use_id: string;
}
interface PostToolUseEmitOptions extends CommonEmitOptions {
    /** Added to Claude's context. Maps to `hookSpecificOutput.additionalContext`. */
    toClaude?: string | OutputBuilder;
    /** Tell Claude to treat the just-completed call as rejected. Maps to top-level `decision: "block"`. */
    deny?: boolean;
    /** Paired with `deny` (shown to Claude) or as context for the user. */
    reason?: string;
    /** For MCP tools: replace what Claude sees as the tool's response. */
    updatedMCPToolOutput?: Record<string, unknown>;
}
declare class PostToolUse {
    static parse(): PostToolUseInput;
    static emitOutput(opts?: PostToolUseEmitOptions): never;
}

/**
 * PreCompact — runs before Claude Code compacts the conversation.
 *
 * `trigger` distinguishes `auto` (context limit reached) from `manual`
 * (user ran /compact). Set `deny: true` to prevent the compaction.
 */

interface PreCompactInput extends RawHookInput<'PreCompact'> {
    trigger: 'manual' | 'auto';
    custom_instructions?: string;
}
interface PreCompactEmitOptions extends CommonEmitOptions {
    /** Prevent compaction. Maps to top-level `decision: "block"`. */
    deny?: boolean;
    /** Paired with `deny`; shown to Claude. */
    reason?: string;
}
declare class PreCompact {
    static parse(): PreCompactInput;
    static emitOutput(opts?: PreCompactEmitOptions): never;
}

/**
 * PreToolUse — runs before Claude calls a tool.
 *
 *   const input = PreToolUse.parse();
 *   if (isDangerous(input.tool_name, input.tool_input)) {
 *       PreToolUse.emitOutput({ decision: 'deny', reason: 'no raw rm' });
 *   } else {
 *       PreToolUse.emitOutput({});
 *   }
 *
 * Input fields are snake_case — they match Claude Code's JSON spec verbatim.
 * Output option names are camelCase — they're our API, mapped to the spec's
 * JSON field names by `emitOutput`.
 */

interface PreToolUseInput extends RawHookInput<'PreToolUse'> {
    tool_name: string;
    tool_input: Record<string, unknown>;
    tool_use_id: string;
}
interface PreToolUseEmitOptions extends CommonEmitOptions {
    /** Added to Claude's context. Maps to `hookSpecificOutput.additionalContext`. */
    toClaude?: string | OutputBuilder;
    /** allow / deny / ask. Maps to `hookSpecificOutput.permissionDecision`. */
    decision?: DecisionType;
    /** Explanation Claude (or the user, for `ask`) sees alongside the decision. */
    reason?: string;
    /** Patch to apply to the tool input before the call. */
    updatedInput?: Record<string, unknown>;
}
declare class PreToolUse {
    static parse(): PreToolUseInput;
    static emitOutput(opts?: PreToolUseEmitOptions): never;
}

/**
 * SessionEnd — runs when a Claude Code session ends.
 *
 * Output-only to the user — there's no future turn to influence. Use it for
 * teardown messaging: final stats, cleanup confirmations, etc.
 */

interface SessionEndInput extends RawHookInput<'SessionEnd'> {
    reason: 'clear' | 'logout' | 'prompt_input_exit' | 'other';
}
type SessionEndEmitOptions = CommonEmitOptions;
declare class SessionEnd {
    static parse(): SessionEndInput;
    static emitOutput(opts?: SessionEndEmitOptions): never;
}

/**
 * SessionStart — runs when a Claude Code session begins.
 *
 * `source` tells you which flavor of start this is — `startup`, `resume`,
 * `clear`, or `compact`. Scripts commonly branch on it to seed different
 * context (e.g. only inject TODO reminders on `startup`).
 *
 * No deny: there's no "session-start rejected" in the spec.
 */

interface SessionStartInput extends RawHookInput<'SessionStart'> {
    source: 'startup' | 'resume' | 'clear' | 'compact';
    model: string;
    agent_type?: string;
}
interface SessionStartEmitOptions extends CommonEmitOptions {
    /** Appended to Claude's session context. Maps to `hookSpecificOutput.additionalContext`. */
    toClaude?: string | OutputBuilder;
}
declare class SessionStart {
    static parse(): SessionStartInput;
    static emitOutput(opts?: SessionStartEmitOptions): never;
}

/**
 * Stop — runs when Claude finishes responding.
 *
 * Set `deny: true` to force Claude to keep going (the only valid decision
 * for Stop hooks). `reason` is shown to Claude so it knows why it must
 * continue. `stop_hook_active` lets you detect re-entry and avoid loops.
 */

interface StopInput extends RawHookInput<'Stop'> {
    stop_hook_active: boolean;
}
interface StopEmitOptions extends CommonEmitOptions {
    /** Prevent Claude from stopping. Maps to top-level `decision: "block"`. */
    deny?: boolean;
    /** Paired with `deny`; tells Claude why it must keep going. */
    reason?: string;
}
declare class Stop {
    static parse(): StopInput;
    static emitOutput(opts?: StopEmitOptions): never;
}

/**
 * SubagentStop — runs when a subagent finishes.
 *
 * Same shape as `Stop`: only meaningful decision is `deny: true` to force
 * the subagent to keep going. Separate event so you can gate subagents
 * differently from the top-level agent.
 */

interface SubagentStopInput extends RawHookInput<'SubagentStop'> {
    stop_hook_active: boolean;
}
interface SubagentStopEmitOptions extends CommonEmitOptions {
    /** Prevent the subagent from stopping. Maps to top-level `decision: "block"`. */
    deny?: boolean;
    /** Paired with `deny`; tells the subagent why it must keep going. */
    reason?: string;
}
declare class SubagentStop {
    static parse(): SubagentStopInput;
    static emitOutput(opts?: SubagentStopEmitOptions): never;
}

/**
 * UserPromptSubmit — runs when the user submits a prompt, before Claude sees it.
 *
 * Set `deny: true` to cancel the prompt entirely. Use `toClaude` to inject
 * extra context alongside the user's prompt (Claude sees it, user doesn't).
 */

interface UserPromptSubmitInput extends RawHookInput<'UserPromptSubmit'> {
    prompt: string;
}
interface UserPromptSubmitEmitOptions extends CommonEmitOptions {
    /** Injected alongside the user's prompt. Maps to `hookSpecificOutput.additionalContext`. */
    toClaude?: string | OutputBuilder;
    /** Cancel the prompt before Claude sees it. Maps to top-level `decision: "block"`. */
    deny?: boolean;
    /** Paired with `deny`; explains why the prompt was cancelled. */
    reason?: string;
}
declare class UserPromptSubmit {
    static parse(): UserPromptSubmitInput;
    static emitOutput(opts?: UserPromptSubmitEmitOptions): never;
}

export { type SubagentStopInput as A, type BoxOptions as B, COLORS as C, type DecisionType as D, type TableOptions as E, type UserPromptSubmitEmitOptions as F, type UserPromptSubmitInput as G, HOOK_EVENT_NAMES as H, currentTheme as I, setTheme as J, type ListOptions as L, MODIFIERS as M, Notification as N, OutputBuilder as O, PostToolUse as P, SessionEnd as S, type Theme as T, UserPromptSubmit as U, type ColorName as a, type CommonHookInput as b, type DividerOptions as c, type HookEventName as d, HookParseError as e, type ModifierName as f, type NotificationEmitOptions as g, type NotificationInput as h, type PostToolUseEmitOptions as i, type PostToolUseInput as j, PreCompact as k, type PreCompactEmitOptions as l, type PreCompactInput as m, PreToolUse as n, type PreToolUseEmitOptions as o, type PreToolUseInput as p, type SessionEndEmitOptions as q, type SessionEndInput as r, SessionStart as s, type SessionStartEmitOptions as t, type SessionStartInput as u, Stop as v, type StopEmitOptions as w, type StopInput as x, SubagentStop as y, type SubagentStopEmitOptions as z };
