// Owner: C
// The lazy `events` chunk (phase2b §11): the event screen (B) and the event art (A). event-flow loads
// it with ONE dynamic import when an event is active or teased (prefetched after Home shows);
// vite.config.ts names it assets/events-*.js. Nothing in the main bundle may import these modules
// statically. F0: the barrel only.
export { eventArt, eventPatternUrl } from '../ui/art/event-art';
export { createEventScreen } from '../ui/screens/event-screen';
