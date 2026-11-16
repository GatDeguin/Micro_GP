# Spaceport service fleet

Original models authored in Blender 5.3 via the Blender MCP connection. No
downloaded models, licensed logos, textures, or added runtime dependencies.

- `spaceport-service-vehicles.blend`: editable source, including an assembled
  review scene and the origin-centered runtime source scene.
- `build-service-vehicles.py`: reproducible generator. Run in Blender; it replaces
  only its own previously generated scene and exports only that active scene.
- `spaceport-service-vehicles-preview.png`: reviewed three-quarter view.
- `verify-service-vehicles.mjs`: Node-only loader, budget and continuous-motion
  verification. Run from the project with `node referencias/spaceport/verify-service-vehicles.mjs`.

Runtime module: `src/display/spaceport-vehicles.ts`.

`buildSpaceportVehicles(parent, { placements, routes })` resolves to `update`,
`setNight`, `setDetail`, and `dispose`. Ground positions use `[x,y,z]`, yaw is in
radians, and vehicles face local +Z. Kinds are `truck`, `pickup`, and `security`.
Routes are closed loops with speed in meters/second, loading pause in milliseconds,
and phase in `[0,1]`. Use `cornerRadius: 0` for paths already rounded by the campus;
raw polygon routes default to an 8-meter corner radius. At most two routes move.

The 555,344-byte GLB has 13 meshes: three body/glass/lamp/beacon sets and one axle-
centered wheel. Paint is vertex color. Wheels instance separately and rotate by
distance/radius. Head/tail lenses use painted emission, amber beacons pulse, and
no runtime light is created. Detail reduction disables vehicle shadows.

Verified with TypeScript, GLTFLoader parsing, and 480 seconds of simulated motion
including loop seams and pauses. A 10-vehicle fleet totals 47,238 triangles in 13
main-pass draws; body and wheel shadows add at most four shadow-pass draws.
The campus adds one shared vertex-alpha contact-shadow batch (14 draws total)
to keep tires grounded in distant sun maps and compact rendering.
Blender review confirmed grounded wheels, orientation, and visible glazing.
