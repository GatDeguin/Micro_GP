import * as THREE from 'three';
import type { CarView } from '../shared/protocol';
import { TRACK } from '../shared/track';
import type { buildPlacard } from './signs';

export function buildReplayShot(renderer: THREE.WebGLRenderer) {
  const camera = new THREE.PerspectiveCamera(38.5, 1, 0.06, 130);
  const plateCamera = new THREE.PerspectiveCamera();
  const plateScene = new THREE.Scene();
  const plateKey = new THREE.DirectionalLight(0xffd2a0, 2);
  plateKey.position.set(-3, 5, 5);
  plateScene.add(plateKey, new THREE.HemisphereLight(0xffead2, 0x3f3636, 1.5));
  plateScene.add(plateCamera);
  const aim = new THREE.Vector3();
  const position = new THREE.Vector3();
  const subject = new THREE.Vector3();
  const sight = new THREE.Vector3();
  const groupAim = new THREE.Vector3();
  let active = false;
  let side = 1;

  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: renderer.extensions.has('EXT_color_buffer_float') ? THREE.HalfFloatType : THREE.UnsignedByteType,
    depthTexture: new THREE.DepthTexture(1, 1, THREE.UnsignedIntType),
    samples: Math.min(2, renderer.capabilities.maxSamples),
  });
  const pixel = new THREE.Vector2();
  const material = new THREE.ShaderMaterial({
    uniforms: {
      image: { value: target.texture }, depthImage: { value: target.depthTexture },
      pixel: { value: pixel }, focus: { value: 5 }, nearPlane: { value: camera.near }, farPlane: { value: camera.far },
    },
    depthTest: false,
    depthWrite: false,
    vertexShader: /* glsl */`
      varying vec2 frameUV;
      void main() {
        frameUV = uv;
        gl_Position = vec4(position.xy, 0., 1.);
      }
    `,
    fragmentShader: /* glsl */`
      #include <packing>
      varying vec2 frameUV;
      uniform sampler2D image, depthImage;
      uniform vec2 pixel;
      uniform float focus, nearPlane, farPlane;

      float distanceAt(vec2 uv) {
        return -perspectiveDepthToViewZ(texture2D(depthImage, uv).x, nearPlane, farPlane);
      }

      void main() {
        float depth = distanceAt(frameUV);
        float blur = depth < focus
          ? smoothstep(.95, 4.7, focus - depth) * 4.5
          : smoothstep(1.5, 16., depth - focus) * 9.5;
        vec4 color = texture2D(image, frameUV);
        if (blur > .45) {
          float total = 1.;
          for (int i = 0; i < 16; i++) {
            float angle = float(i) * 2.39996;
            float radius = sqrt((float(i) + .5) / 16.);
            vec2 uv = frameUV + vec2(cos(angle), sin(angle)) * radius * pixel * blur;
            float weight = smoothstep(depth - 1.2, depth - .22, distanceAt(uv));
            color += texture2D(image, uv) * weight;
            total += weight;
          }
          color /= total;
        }
        gl_FragColor = color;
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const imageScene = new THREE.Scene();
  const imageCamera = new THREE.Camera();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  imageScene.add(quad);

  return {
    stop() { active = false; },
    render(scene: THREE.Scene, car: CarView, rival: CarView | undefined, width: number, height: number, dt: number,
      placard: ReturnType<typeof buildPlacard>) {
      const lane = TRACK.locate(car.x, car.z);
      if (!active) side = lane.offset > 1.25 ? -1 : 1;
      // The low atlas view puts the lens on the shoulder with the curb crossing the foreground.
      const ahead = TRACK.sampleAt(lane.s + 4.72);
      const shoulder = THREE.MathUtils.clamp(lane.offset + 3.83 * side, -3.13, 3.13);
      position.set(ahead.x - ahead.dz * shoulder, ahead.y + 0.67, ahead.z + ahead.dx * shoulder);
      subject.set(car.x, car.y + 0.54, car.z);
      groupAim.set(car.x, car.y + 0.24, car.z);
      if (rival) groupAim.lerp(sight.set(rival.x, rival.y + 0.29, rival.z), 0.16);
      if (active) {
        camera.position.lerp(position, 1 - Math.exp(-dt * 14));
        aim.lerp(groupAim, 1 - Math.exp(-dt * 10));
      } else {
        camera.position.copy(position);
        aim.copy(groupAim);
      }
      active = true;
      camera.aspect = width / height;
      camera.fov = THREE.MathUtils.clamp(38.5 + 14 * (16 / 9 - camera.aspect), 38.5, 55);
      camera.updateProjectionMatrix();
      camera.lookAt(aim);
      camera.updateMatrixWorld();
      const screenX = position.copy(subject).project(camera).x;
      const safeX = THREE.MathUtils.clamp(screenX, -0.27, 0.18);
      if (Math.abs(screenX - safeX) > 0.001) {
        const halfWidth = camera.position.distanceTo(aim) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
        groupAim.copy(aim).addScaledVector(sight.setFromMatrixColumn(camera.matrixWorld, 0), (screenX - safeX) * halfWidth);
        camera.lookAt(groupAim);
        camera.updateMatrixWorld();
      }
      camera.getWorldDirection(sight);
      material.uniforms.focus.value = subject.sub(camera.position).dot(sight);

      const ratio = Math.min(1, 1600 / Math.max(width, height));
      const targetWidth = Math.max(1, Math.round(width * ratio));
      const targetHeight = Math.max(1, Math.round(height * ratio));
      target.setSize(targetWidth, targetHeight);
      pixel.set(1 / targetWidth, 1 / targetHeight);
      const plate = placard.object;
      plateCamera.copy(camera);
      plateCamera.updateMatrixWorld();
      placard.resize(plateCamera, width, height, ahead.y);
      plateScene.add(plate);
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.render(imageScene, imageCamera);

      // The etched code stays pixel-sharp, even when the track is out of focus.
      plateKey.position.set(-2, 5, 3).applyMatrix4(camera.matrixWorld);
      plateKey.target.position.copy(plate.position);
      plateKey.target.updateMatrixWorld();
      renderer.autoClear = false;
      renderer.clearDepth();
      renderer.render(plateScene, plateCamera);
      renderer.autoClear = true;
      scene.add(plate);
    },
  };
}
