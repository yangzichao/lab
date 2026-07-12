import { clamp, degreesToRadians } from '../shared/format';

export type MagnusParameters = {
  launchSpeed: number;
  launchAngle: number;
  spinRate: number;
  ballDiameter: number;
};

export type FlightPoint = { x: number; y: number };

export type MagnusState = {
  position: FlightPoint;
  velocity: FlightPoint;
  referencePosition: FlightPoint;
  referenceVelocity: FlightPoint;
  trail: FlightPoint[];
  referenceTrail: FlightPoint[];
  elapsedSeconds: number;
  landed: boolean;
};

export type MagnusSnapshot = {
  speed: number;
  spinRatio: number;
  liftCoefficient: number;
  liftForce: number;
  dragForce: number;
};

const gravity = 9.81;
const airDensity = 1.225;
const dragCoefficient = 0.47;
const ballMass = 0.43;

export function createMagnusState(parameters: MagnusParameters): MagnusState {
  const angle = degreesToRadians(parameters.launchAngle);
  const velocity = {
    x: parameters.launchSpeed * Math.cos(angle),
    y: parameters.launchSpeed * Math.sin(angle),
  };
  const origin = { x: 0, y: 0.32 };
  return {
    position: { ...origin },
    velocity: { ...velocity },
    referencePosition: { ...origin },
    referenceVelocity: { ...velocity },
    trail: [{ ...origin }],
    referenceTrail: [{ ...origin }],
    elapsedSeconds: 0,
    landed: false,
  };
}

export function getMagnusSnapshot(
  velocity: FlightPoint,
  parameters: MagnusParameters,
): MagnusSnapshot {
  const speed = Math.max(0.01, Math.hypot(velocity.x, velocity.y));
  const radius = parameters.ballDiameter / 200;
  const angularSpeed = parameters.spinRate * Math.PI / 30;
  const spinRatio = angularSpeed * radius / speed;
  const liftCoefficient = clamp(1.2 * spinRatio, -0.65, 0.65);
  const area = Math.PI * radius * radius;
  return {
    speed,
    spinRatio,
    liftCoefficient,
    liftForce: 0.5 * airDensity * area * liftCoefficient * speed * speed,
    dragForce: 0.5 * airDensity * area * dragCoefficient * speed * speed,
  };
}

function acceleration(
  velocity: FlightPoint,
  parameters: MagnusParameters,
  includeMagnus: boolean,
): FlightPoint {
  const snapshot = getMagnusSnapshot(velocity, parameters);
  const inverseSpeed = 1 / snapshot.speed;
  const dragAcceleration = snapshot.dragForce / ballMass;
  const liftAcceleration = includeMagnus ? snapshot.liftForce / ballMass : 0;
  return {
    x:
      -dragAcceleration * velocity.x * inverseSpeed
      - liftAcceleration * velocity.y * inverseSpeed,
    y:
      -gravity
      - dragAcceleration * velocity.y * inverseSpeed
      + liftAcceleration * velocity.x * inverseSpeed,
  };
}

function integrate(
  position: FlightPoint,
  velocity: FlightPoint,
  parameters: MagnusParameters,
  deltaSeconds: number,
  includeMagnus: boolean,
): void {
  const currentAcceleration = acceleration(velocity, parameters, includeMagnus);
  velocity.x += currentAcceleration.x * deltaSeconds;
  velocity.y += currentAcceleration.y * deltaSeconds;
  position.x += velocity.x * deltaSeconds;
  position.y += velocity.y * deltaSeconds;
}

export function stepMagnusState(
  state: MagnusState,
  parameters: MagnusParameters,
  deltaSeconds: number,
): void {
  if (state.landed) {
    return;
  }
  const substeps = Math.max(1, Math.ceil(deltaSeconds / 0.008));
  const stepSeconds = deltaSeconds / substeps;
  for (let index = 0; index < substeps; index += 1) {
    integrate(state.position, state.velocity, parameters, stepSeconds, true);
    integrate(
      state.referencePosition,
      state.referenceVelocity,
      parameters,
      stepSeconds,
      false,
    );
    state.elapsedSeconds += stepSeconds;
    if (state.position.y <= 0 && state.elapsedSeconds > 0.08) {
      state.position.y = 0;
      state.landed = true;
      break;
    }
  }
  state.trail.push({ ...state.position });
  state.referenceTrail.push({ ...state.referencePosition });
  if (state.trail.length > 500) state.trail.shift();
  if (state.referenceTrail.length > 500) state.referenceTrail.shift();
}
