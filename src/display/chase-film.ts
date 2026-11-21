import * as THREE from 'three';

const vertex = /* glsl */`
  varying vec2 vFilmUv;
  void main() {
    vFilmUv = position.xy * .5 + .5;
    gl_Position = vec4(position, 1.0);
  }
`;

const depthFunctions = /* glsl */`
  uniform sampler2D sceneDepth;
  uniform vec2 clipPlanes;
  float eyeDepth(vec2 uv) {
    float depth = texture2D(sceneDepth, uv).r;
    return clipPlanes.x * clipPlanes.y / mix(clipPlanes.y, clipPlanes.x, depth);
  }
`;

const effects = /* glsl */`
  varying vec2 vFilmUv;
  uniform sampler2D sceneColor;
  uniform vec2 pixel;
  uniform vec4 unproject;
  uniform float night;
  layout(location = 0) out vec4 opticalResult;
  layout(location = 1) out vec4 lensResult;
  ${depthFunctions}

  vec3 viewPoint(vec2 uv, float depth) {
    return vec3(((uv * 2.0 - 1.0) + unproject.zw) * unproject.xy * depth, -depth);
  }
  vec3 highlight(vec3 color) {
    float peak = max(color.r, max(color.g, color.b));
    // The soft threshold retains the warm color of lamps and rolls off rockets.
    return min(color, vec3(12.0)) * smoothstep(mix(1.48, .91, night), mix(3.12, 2.18, night), peak);
  }
  void gather(vec2 shift, float weight, vec3 center, float depth, inout vec3 glow, inout vec3 lensColor) {
    vec2 uv = vFilmUv + shift;
    vec3 color = texture2D(sceneColor, uv).rgb;
    glow += highlight(color) * weight;
    // Refuse foreground colors while softening more distant surfaces.
    float gate = smoothstep(depth * .72, depth * .94, eyeDepth(uv));
    lensColor += mix(center, color, gate) * weight;
  }
  float obscurance(vec2 delta, vec3 origin, vec3 normal) {
    vec2 uv = vFilmUv + delta;
    vec3 samplePoint = viewPoint(uv, eyeDepth(uv));
    vec3 ray = samplePoint - origin;
    float range = length(ray);
    float above = max(0.0, dot(normal, ray) - .042);
    return above / max(range, .035) * (1.0 - smoothstep(.18, 1.16, range));
  }
  void main() {
    float depth = eyeDepth(vFilmUv);
    vec3 center = texture2D(sceneColor, vFilmUv).rgb;
    vec2 stepPixel = pixel * mix(3.0, 5.1, smoothstep(16.0, 69.0, depth));
    vec3 glow = highlight(center) * .28;
    vec3 lensColor = center * .28;
    gather(stepPixel * vec2(1.0, 0.0), .125, center, depth, glow, lensColor);
    gather(stepPixel * vec2(-1.0, 0.0), .125, center, depth, glow, lensColor);
    gather(stepPixel * vec2(0.0, 1.0), .125, center, depth, glow, lensColor);
    gather(stepPixel * vec2(0.0, -1.0), .125, center, depth, glow, lensColor);
    gather(stepPixel * vec2(.8, .8), .055, center, depth, glow, lensColor);
    gather(stepPixel * vec2(-.8, .8), .055, center, depth, glow, lensColor);
    gather(stepPixel * vec2(.8, -.8), .055, center, depth, glow, lensColor);
    gather(stepPixel * vec2(-.8, -.8), .055, center, depth, glow, lensColor);
    vec3 positionView = viewPoint(vFilmUv, depth);
    vec3 faceNormal = cross(dFdx(positionView), dFdy(positionView));
    float shadow = 0.0;
    if (depth < 62.0 && dot(faceNormal, faceNormal) > 1e-12) {
      faceNormal = normalize(faceNormal);
      vec2 stepSize = min(vec2(.075), .40 / max(1.0, depth) / unproject.xy);
      shadow = obscurance(stepSize * vec2(.48, .09), positionView, faceNormal)
        + obscurance(stepSize * vec2(-.42, -.17), positionView, faceNormal)
        + obscurance(stepSize * vec2(-.15, .58), positionView, faceNormal)
        + obscurance(stepSize * vec2(.16, -.54), positionView, faceNormal)
        + obscurance(stepSize * vec2(.83, .69), positionView, faceNormal)
        + obscurance(stepSize * vec2(-.78, -.61), positionView, faceNormal)
        + obscurance(stepSize * vec2(-.73, .67), positionView, faceNormal)
        + obscurance(stepSize * vec2(.68, -.82), positionView, faceNormal);
      shadow *= (1.0 - smoothstep(30.0, 62.0, depth)) * .145;
    }
    opticalResult = vec4(glow, min(shadow, .49));
    lensResult = vec4(lensColor, depth);
  }
`;

const composite = /* glsl */`
  varying vec2 vFilmUv;
  uniform sampler2D sceneColor;
  uniform sampler2D effectsImage;
  uniform sampler2D lensImage;
  uniform vec2 pixel;
  uniform float focusDepth;
  uniform float night;
  uniform float softLens;
  ${depthFunctions}
  #include <common>
  #include <tonemapping_pars_fragment>
  #include <dithering_pars_fragment>

  float filmLuma(vec3 color) {
    return sqrt(max(dot(color, vec3(.2126, .7152, .0722)), 0.0));
  }

  vec3 softenEdge(vec3 center) {
    float middle = filmLuma(center);
    float a = filmLuma(texture2D(sceneColor, vFilmUv + pixel * vec2(-1.0, -1.0)).rgb);
    float b = filmLuma(texture2D(sceneColor, vFilmUv + pixel * vec2( 1.0, -1.0)).rgb);
    float c = filmLuma(texture2D(sceneColor, vFilmUv + pixel * vec2(-1.0,  1.0)).rgb);
    float d = filmLuma(texture2D(sceneColor, vFilmUv + pixel * vec2( 1.0,  1.0)).rgb);
    float darkest = min(middle, min(min(a, b), min(c, d)));
    float brightest = max(middle, max(max(a, b), max(c, d)));
    float contrast = brightest - darkest;
    if (contrast < max(.023, brightest * .088)) return center;

    // Follow the edge to smooth stair steps without softening the road as a whole.
    vec2 tangent = vec2(a + b - c - d, c + a - d - b);
    float minimumStep = max(.018, (a + b + c + d) * .027);
    vec2 stepSize = clamp(tangent / (min(abs(tangent.x), abs(tangent.y)) + minimumStep), -4.0, 4.0) * pixel;
    vec3 interior = (texture2D(sceneColor, vFilmUv - stepSize / 6.0).rgb
      + texture2D(sceneColor, vFilmUv + stepSize / 6.0).rgb) * .5;
    vec3 exterior = (texture2D(sceneColor, vFilmUv - stepSize * .5).rgb
      + texture2D(sceneColor, vFilmUv + stepSize * .5).rgb) * .25 + interior * .5;
    float outside = filmLuma(exterior);
    vec3 filtered = outside < darkest || outside > brightest ? interior : exterior;

    // Isolated subpixel details can cancel the directional gradient.
    float mean = (a + b + c + d) * .25;
    float isolated = clamp(abs(mean - middle) / contrast, 0.0, 1.0);
    float strength = smoothstep(contrast * .045, contrast * .32, max(abs(tangent.x), abs(tangent.y)));
    if (strength < .85 && isolated > .18) {
      vec3 crossColor = (texture2D(sceneColor, vFilmUv + pixel * vec2(.5, 0.0)).rgb
        + texture2D(sceneColor, vFilmUv - pixel * vec2(.5, 0.0)).rgb
        + texture2D(sceneColor, vFilmUv + pixel * vec2(0.0, .5)).rgb
        + texture2D(sceneColor, vFilmUv - pixel * vec2(0.0, .5)).rgb) * .25;
      filtered = mix(mix(center, crossColor, isolated * .83), filtered, strength);
    }
    return mix(center, filtered, .86);
  }

  void main() {
    vec3 color = softenEdge(texture2D(sceneColor, vFilmUv).rgb);
    float depth = eyeDepth(vFilmUv);
    float blur = .80 * softLens * smoothstep(focusDepth + 10.0, focusDepth + 54.0, depth);
    if (blur > .025) {
      vec4 distant = texture2D(lensImage, vFilmUv);
      color = mix(color, distant.rgb, blur * smoothstep(.83, .975, distant.a / depth));
    }
    vec4 optical = texture2D(effectsImage, vFilmUv);
    // Reject blurred occlusion from another depth layer along hard silhouettes.
    float edge = clamp(length(vec2(dFdx(depth), dFdy(depth))) / max(.35, depth * .10), 0.0, 1.0);
    color *= 1.0 - optical.a * (1.0 - edge * .80);
    color += optical.rgb * mix(.068, .19, night);

    vec2 field = vFilmUv * 2.0 - 1.0;
    color *= 1.0 - .135 * smoothstep(.35, 1.8, dot(field, field));
    vec3 film = AgXToneMapping(color * mix(1.06, 1.25, night));
    float luminance = dot(film, vec3(.2126, .7152, .0722));
    film = max(mix(vec3(luminance), film, 1.12), vec3(0.0));
    vec3 neutral = NeutralToneMapping(color);
    vec3 graded = mix(neutral, film, .59);
    float midtone = dot(graded, vec3(.2126, .7152, .0722));
    graded *= mix(.85, 1.07, smoothstep(.025, .60, midtone));
    gl_FragColor = vec4(graded, 1.0);
    #include <colorspace_fragment>
    #include <dithering_fragment>
  }
`;

/** A shared HDR scene buffer plus a small effects buffer. The world is drawn
 * once; the QR placard and menus are composed afterwards at their normal size. */
export function buildChaseFilm(renderer: THREE.WebGLRenderer) {
  if (!renderer.extensions.has('EXT_color_buffer_float')) return undefined;

  const depth = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
  depth.minFilter = depth.magFilter = THREE.NearestFilter;
  const image = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthTexture: depth });
  const optical = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false, count: 2 });
  image.texture.name = 'Persecución HDR';
  optical.texture.name = 'Resplandor y oclusión de contacto';
  optical.textures[1].name = 'Enfoque de fondo';

  const pixel = { value: new THREE.Vector2(1, 1) };
  const clipPlanes = { value: new THREE.Vector2() };
  const night = { value: 0 };
  const unproject = { value: new THREE.Vector4() };
  const shared = { sceneColor: { value: image.texture }, sceneDepth: { value: depth }, pixel, clipPlanes, night };
  const effectsMaterial = new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: effects,
    uniforms: { ...shared, unproject }, glslVersion: THREE.GLSL3, toneMapped: false, depthWrite: false, depthTest: false });
  const outputMaterial = new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: composite,
    uniforms: { ...shared, effectsImage: { value: optical.texture }, lensImage: { value: optical.textures[1] }, focusDepth: { value: 6 },
      softLens: { value: 1 }, toneMappingExposure: { value: 1 } },
    dithering: true, toneMapped: false, depthWrite: false, depthTest: false });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const screen = new THREE.Scene();
  const lens = new THREE.Camera();
  const triangle = new THREE.Mesh(geometry, effectsMaterial); triangle.frustumCulled = false;
  screen.add(triangle);
  const size = new THREE.Vector2();

  function resize() {
    renderer.getDrawingBufferSize(size);
    image.setSize(size.x, size.y);
    optical.setSize(Math.max(1, Math.ceil(size.x / 4)), Math.max(1, Math.ceil(size.y / 4)));
    pixel.value.set(1 / size.x, 1 / size.y);
  }

  function render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, focus: number, nightView: boolean, blur: boolean) {
    resize();
    clipPlanes.value.set(camera.near, camera.far);
    const projection = camera.projectionMatrix.elements;
    unproject.value.set(1 / projection[0], 1 / projection[5], projection[8], projection[9]);
    outputMaterial.uniforms.focusDepth.value = focus;
    night.value = Number(nightView);
    outputMaterial.uniforms.softLens.value = Number(blur);
    outputMaterial.uniforms.toneMappingExposure.value = renderer.toneMappingExposure;

    const previous = renderer.getRenderTarget();
    try {
      renderer.setRenderTarget(image);
      renderer.render(scene, camera);
      renderer.setRenderTarget(optical);
      triangle.material = effectsMaterial;
      renderer.render(screen, lens);
    } finally {
      renderer.setRenderTarget(previous);
    }
    triangle.material = outputMaterial;
    renderer.render(screen, lens);
  }

  return {
    render,
    async prepare(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
      resize();
      const previous = renderer.getRenderTarget();
      let pending: Promise<THREE.Object3D>;
      try {
        renderer.setRenderTarget(image);
        pending = renderer.compileAsync(scene, camera);
      } finally {
        renderer.setRenderTarget(previous);
      }
      await pending;
    },
  };
}
