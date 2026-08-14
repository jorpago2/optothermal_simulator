# Interface adapter

This application follows the normative `@jorpago2/scientific-ui` interface contract and Carbon `g10`. Shared application chrome, responsive navigation, help, status, execution, validation, numerical fields and plot framing must remain in the shared package rather than being restyled locally.

Local visual exceptions are limited to scientific data encoding: the temperature colour map and the distinct traces for temperature, phase fraction and absorptance. The bottom navigation used on narrow viewports is the established mobile exception in `scientific-ui`.
