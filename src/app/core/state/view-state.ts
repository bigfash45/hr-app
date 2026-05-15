/**
 * The four states every async screen moves through.
 *
 * Lives in core rather than beside the component that renders it, so
 * core/state/async-state.ts doesn't have to reach up into shared/ui for a type.
 */
export type ViewState = 'loading' | 'ready' | 'empty' | 'error';
