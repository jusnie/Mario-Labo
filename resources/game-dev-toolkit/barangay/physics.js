/**
 * physics.js — the Rapier world, shared by the game and the walkthrough test.
 *
 * Keeping this in one place means `npm run walkthrough` exercises the same
 * colliders, capsule and character controller the browser runs.
 */
import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { LAYOUT } from "./world.js";

export const PLAYER = { halfHeight: 0.42, radius: 0.28 };
/** Capsule centre above the floor it stands on (half height + radius). */
const FEET_TO_CENTRE = PLAYER.halfHeight + PLAYER.radius;
/** Tallest riser the player can mount — one porch tread, with margin. */
const STEP_HEIGHT = 0.40;
export const START_POSITION = { x: 0, y: 1.0, z: LAYOUT.startZ };

export function buildPhysics(colliderDescriptors) {
  const world = new RAPIER.World({ x: 0, y: -22, z: 0 });

  // ground slab: its top surface is y = 0
  const groundBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, -150));
  world.createCollider(RAPIER.ColliderDesc.cuboid(320, 0.5, 500), groundBody);

  // static props from the world builders
  for (const d of colliderDescriptors) {
    const desc = RAPIER.RigidBodyDesc.fixed().setTranslation(d.pos[0], d.pos[1], d.pos[2]);
    // rotated boxes are needed for the hidden ramps under the door steps: the
    // character controller walks up a slope but will not auto-step a riser
    if (d.quat) desc.setRotation({ x: d.quat[0], y: d.quat[1], z: d.quat[2], w: d.quat[3] });
    const body = world.createRigidBody(desc);
    world.createCollider(RAPIER.ColliderDesc.cuboid(d.half[0], d.half[1], d.half[2]), body);
  }

  // invisible play bounds so Ernie cannot wander off the map
  const bounds = [
    { half: [1, 40, 400], pos: [LAYOUT.playMinX - 1, 0, -120] },
    { half: [1, 40, 400], pos: [LAYOUT.playMaxX + 1, 0, -120] },
    { half: [90, 40, 1], pos: [0, 0, LAYOUT.playMinZ - 1] },
    { half: [90, 40, 1], pos: [0, 0, LAYOUT.playMaxZ + 1] },
  ];
  for (const b of bounds) {
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(...b.pos));
    world.createCollider(RAPIER.ColliderDesc.cuboid(...b.half), body);
  }

  const controller = world.createCharacterController(0.02);
  controller.enableAutostep(0.42, 0.22, true);
  controller.enableSnapToGround(0.4);
  controller.setMaxSlopeClimbAngle((52 * Math.PI) / 180);
  controller.setMinSlopeSlideAngle((32 * Math.PI) / 180);
  controller.setApplyImpulsesToDynamicBodies(false);

  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
      START_POSITION.x,
      START_POSITION.y,
      START_POSITION.z
    )
  );
  const collider = world.createCollider(
    RAPIER.ColliderDesc.capsule(PLAYER.halfHeight, PLAYER.radius),
    body
  );

  return { world, controller, body, collider };
}

/**
 * Advance the character one frame. Shared with the game loop so the test and
 * the browser cannot drift apart.
 */
/**
 * Height of the first thing in front of the player that could be a step, or
 * null when there is nothing within reach. Measured by dropping a ray onto the
 * ledge just ahead of the capsule.
 */
function ledgeAhead(physics, p, dirX, dirZ) {
  const reach = PLAYER.radius + 0.12;
  const originY = p.y + STEP_HEIGHT;
  const ray = new RAPIER.Ray(
    { x: p.x + dirX * reach, y: originY, z: p.z + dirZ * reach },
    { x: 0, y: -1, z: 0 }
  );
  const hit = physics.world.castRay(ray, STEP_HEIGHT + 0.6, true, undefined, undefined, physics.collider);
  return hit ? originY - hit.timeOfImpact : null;
}

export function stepPlayer(physics, wishX, wishZ, velocityY, dt) {
  const ctrl = physics.controller;
  const wish = { x: wishX * dt, y: velocityY * dt, z: wishZ * dt };
  ctrl.computeColliderMovement(physics.collider, wish);
  let mv = ctrl.computedMovement();

  // Rapier's own autostep refuses vertical risers in this build (it will not
  // mount even a 0.2 m curb), so the porch and the hall steps are climbed by
  // hand: when the walk is blocked but there is a low ledge right in front, the
  // capsule is lifted onto it and the frame is finished from up there.
  const wanted = Math.hypot(wishX, wishZ) * dt;
  const blocked = wanted > 1e-5 && Math.hypot(mv.x, mv.z) < wanted * 0.55;
  if (blocked) {
    const p = physics.body.translation();
    const len = Math.hypot(wishX, wishZ) || 1;
    const ledge = ledgeAhead(physics, p, wishX / len, wishZ / len);
    const floorY = p.y - FEET_TO_CENTRE;
    const rise = ledge === null ? 0 : ledge - floorY;
    if (rise > 0.02 && rise <= STEP_HEIGHT) {
      physics.body.setTranslation({ x: p.x, y: ledge + FEET_TO_CENTRE + 0.02, z: p.z }, true);
      ctrl.computeColliderMovement(physics.collider, { x: wish.x, y: -0.5 * dt, z: wish.z });
      mv = ctrl.computedMovement();
    }
  }

  const p = physics.body.translation();
  physics.body.setNextKinematicTranslation({ x: p.x + mv.x, y: p.y + mv.y, z: p.z + mv.z });
  const grounded = ctrl.computedGrounded();
  physics.world.step();
  return { grounded, moved: Math.hypot(mv.x, mv.z), position: physics.body.translation() };
}

/**
 * A door that actually blocks. The leaf is a kinematic body hung on the hinge,
 * so its collider follows the swing exactly: shut, you cannot walk through the
 * front door; open, the doorway is clear. Built from the leaf's own world
 * transform, so moving the house moves the door with it.
 */
export function createSwingingDoor(world, leaf, { width, height, thickness = 0.05 } = {}) {
  leaf.updateWorldMatrix(true, false);
  const hinge = new THREE.Vector3();
  leaf.getWorldPosition(hinge);
  const baseQuat = new THREE.Quaternion();
  leaf.getWorldQuaternion(baseQuat);
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(hinge.x, hinge.y, hinge.z)
      .setRotation({ x: baseQuat.x, y: baseQuat.y, z: baseQuat.z, w: baseQuat.w })
  );
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(width / 2, height / 2, thickness).setTranslation(width / 2, height / 2, 0),
    body
  );
  const axis = new THREE.Vector3(0, 1, 0);
  const swing = new THREE.Quaternion();
  const worldQ = new THREE.Quaternion();
  return {
    body,
    setAngle(angle) {
      swing.setFromAxisAngle(axis, angle);
      worldQ.copy(baseQuat).multiply(swing);
      body.setNextKinematicRotation({ x: worldQ.x, y: worldQ.y, z: worldQ.z, w: worldQ.w });
    },
  };
}
