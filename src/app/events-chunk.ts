// Owner: C
// The lazy `events` chunk (phase2b §11): the event screen (B) and the event art (A). event-flow loads
// it with ONE dynamic import when an event is active or teased (prefetched after Home shows), and an
// event session starts it too (its board's accessory symbols come with it); vite.config.ts names it
// assets/events-*.js. Nothing in the main bundle may import these modules statically.
// 2b integration (04 §9): the event screen's and the event art's stylesheet comes with this chunk.
import '../styles/events-chunk.css';

export { eventArt, eventPatternUrl } from '../ui/art/event-art';
export { createEventScreen } from '../ui/screens/event-screen';
