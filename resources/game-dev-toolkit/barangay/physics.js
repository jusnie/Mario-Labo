/**
 * physics.js — the Rapier world, shared by the game and the walkthrough test.
 *
 * Keeping this in one place means `npm run walkthrough` exercises the same
 * colliders, capsule and character controller the browser runs.
 */
import RAPIER from "@dimforge/rapier3d-compat";
import { LAYOUT } from "./world.js";

export const PLAYER = { halfHeight: 0.42, radius: 0.28 };
export const START_POSITION = { x: 0, y: 1.0, z: LAYOUT.startZ };

export function buildPhysics(colliderDescriptors) {
  const world = new RAPIER.World({ x: 0, y: -22, z: 0 });

  // ground slab: its top surface is y = 0
  const groundBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, -150));
  world.createCollider(RAPIER.ColliderDesc.cuboid(320, 0.5, 500), groundBody);

  // static props from the world builders
  for (const d of colliderDescriptors) {
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(d.pos[0], d.pos[1], d.pos[2])
    );
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
export function stepPlayer(physics, wishX, wishZ, velocityY, dt) {
  physics.controller.computeColliderMovement(physics.collider, {
    x: wishX * dt,
    y: velocityY * dt,
    z: wishZ * dt,
  });
  const mv = physics.controller.computedMovement();
  const p = physics.body.translation();
  physics.body.setNextKinematicTranslation({ x: p.x + mv.x, y: p.y + mv.y, z: p.z + mv.z });
  const grounded = physics.controller.computedGrounded();
  physics.world.step();
  return { grounded, moved: Math.hypot(mv.x, mv.z), position: physics.body.translation() };
}
