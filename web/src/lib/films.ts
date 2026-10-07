/* plain data, no "use client": the film pages render on the server and the
   player and the lightbox on the client, and both read this. a constant
   exported from a client module reaches a server component as a reference,
   not as the object, which is why it lives here. */
/* the three films, self hosted.
 *
 * the mp4s live in public/media on the vm and are not in git: 30 MB of video
 * in the repository would ride along in every clone forever. deploy.sh sends
 * them in their own step, which never deletes, so a deploy from a fresh clone
 * cannot wipe them. the posters, share cards and captions are small and are in
 * git. each mp4 is fast start (the index first), so playback begins before the
 * file has finished arriving. */
export const FILMS = {
  launch: {
    path: "/launch", title: "The launch film", length: "40 seconds",
    src: "/media/trustset-launch.mp4", poster: "/media/launch-poster.jpg", captions: "/media/trustset-launch.vtt",
    line: "The trust stack for AI agents, in forty seconds: a stop that did not stop the money, and the stop that does.",
  },
  walkthrough: {
    path: "/walkthrough", title: "The walkthrough", length: "2 minutes 48",
    src: "/media/trustset-walkthrough.mp4", poster: "/media/walkthrough-poster.jpg", captions: "/media/trustset-walkthrough.vtt",
    line: "The real product on Monad testnet, recorded at real speed: an app refusing a switched off agent, then every layer, each ending on its transaction.",
  },
  /* the pitch has no link from anywhere on the site: its address goes into
     the submission form, and that is the only way in */
  pitch: {
    path: "/pitch", title: "The pitch", length: "2 minutes 30",
    src: "/media/trustset-pitch.mp4", poster: "/media/pitch-poster.jpg", captions: "/media/trustset-pitch.vtt",
    line: "Why AI agents need a stop that works outside their own app, and how trustset puts it on Monad.",
  },
} as const;
export type FilmKey = keyof typeof FILMS;
