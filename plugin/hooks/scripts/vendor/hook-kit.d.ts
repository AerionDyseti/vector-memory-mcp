import { T as Theme } from './UserPromptSubmit-B4FTNL55.js';
export { B as BoxOptions, C as COLORS, a as ColorName, b as CommonHookInput, D as DecisionType, c as DividerOptions, H as HOOK_EVENT_NAMES, d as HookEventName, e as HookParseError, L as ListOptions, M as MODIFIERS, f as ModifierName, N as Notification, g as NotificationEmitOptions, h as NotificationInput, O as OutputBuilder, P as PostToolUse, i as PostToolUseEmitOptions, j as PostToolUseInput, k as PreCompact, l as PreCompactEmitOptions, m as PreCompactInput, n as PreToolUse, o as PreToolUseEmitOptions, p as PreToolUseInput, S as SessionEnd, q as SessionEndEmitOptions, r as SessionEndInput, s as SessionStart, t as SessionStartEmitOptions, u as SessionStartInput, v as Stop, w as StopEmitOptions, x as StopInput, y as SubagentStop, z as SubagentStopEmitOptions, A as SubagentStopInput, E as TableOptions, U as UserPromptSubmit, F as UserPromptSubmitEmitOptions, G as UserPromptSubmitInput, I as currentTheme, J as setTheme } from './UserPromptSubmit-B4FTNL55.js';

/**
 * Tag parser + ANSI renderer.
 *
 * Tiny XML-like markup so callers can style strings declaratively:
 *
 *   <color:"red">error</color>
 *   <bg:"yellow">!</bg>
 *   <bold><color:"red">hi</color></bold>
 *
 * For icons, use the `ICONS` constants directly in template strings:
 *
 *   `${ICONS.check} done`
 *
 * Rules:
 *   - Unknown tags pass through literally (users see their typos).
 *   - Colors off → tags are stripped, contents survive.
 *   - A trailing `\x1b[0m` is appended when any ANSI was emitted, so escape
 *     state never leaks past the rendered string.
 *
 * Known limitation: same-kind nesting (`<color:"red">..<color:"blue">..</color>..</color>`)
 * doesn't restore the outer color after the inner close — `</color>` always
 * emits the default-foreground reset. Cross-kind nesting (`<bold><color>`) is
 * fine. For the common case (colorize a span, optionally bold it) this is
 * more than enough.
 */

declare function renderTags(input: string, theme?: Theme): string;
declare function stripTags(input: string): string;
/**
 * Cell width of a rendered string. Delegates to `string-width` for CJK /
 * emoji / ZWJ correctness; strips our own tag markup first.
 */
declare function visualWidth(input: string): number;

/**
 * Named icons for use in output strings.
 *
 * Drop them in with template literals — no parser, no tag grammar:
 *
 *   builder.appendLine(`${ICONS.check} build passed`);
 *   builder.appendLine(`${ICONS.warn} ${count} files skipped`);
 *
 * To add an icon: put it in `ICONS` and it's instantly available.
 * Typos are compile errors (`ICONS.chek` won't typecheck).
 */
declare const ICONS: {
    readonly check: "✓";
    readonly cross: "✗";
    readonly warn: "⚠";
    readonly info: "ℹ";
    readonly arrow: "▸";
    readonly bullet: "•";
    readonly dot: "·";
    readonly star: "★";
};
type IconName = keyof typeof ICONS;

/**
 * Opt-in wrapper for a hook script's body.
 *
 * The library's `parse()` methods throw `HookParseError` on bad input — that
 * keeps the parser SRP-clean, but it means a bare top-level script would
 * exit with Node's default (code 1 + a stack trace) on a misconfigured
 * `settings.json`. Claude Code's hook protocol distinguishes exit 2
 * (blocking error, stderr relayed to Claude) from exit 1 (non-blocking), so
 * that default is worse than the old auto-handling.
 *
 * Wrap your hook body in `runHook` to restore the protocol-correct behavior
 * without giving up the flexibility of opting out:
 *
 *   // hooks/pre-tool-use.ts
 *   import { runHook, PreToolUse } from '@aeriondyseti/hook-kit';
 *
 *   runHook(() => {
 *     const input = PreToolUse.parse();
 *     if (isDangerous(input)) {
 *       PreToolUse.emitOutput({ decision: 'deny', reason: '...' });
 *     } else {
 *       PreToolUse.emitOutput({});
 *     }
 *   });
 *
 * `emitOutput` calls `process.exit(0)` itself on success, so `runHook` only
 * needs to catch failures. A non-parse error is re-thrown so Node's default
 * handling (stack trace, exit 1) still surfaces actual bugs.
 */
declare function runHook(fn: () => void): void;

export { ICONS, type IconName, Theme, renderTags, runHook, stripTags, visualWidth };
