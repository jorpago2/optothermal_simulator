# Interface adapter

This application follows the normative `@jorpago2/scientific-ui` interface contract and Carbon `g10`. Shared application chrome, responsive navigation, help, status, execution, validation, numerical fields and plot framing must remain in the shared package rather than being restyled locally.

The application uses a technical Workbench structure: persistent workflow navigation, a focused parameter task panel and a scrollable scientific stage for run overview, results and validation. IBM Plex Sans and Carbon spacing/type tokens apply throughout.

Local visual exceptions are limited to scientific data encoding: the temperature colour map and the distinct traces for temperature, phase fraction and absorptance. The bottom navigation used on narrow viewports is the established mobile exception in `scientific-ui`.
