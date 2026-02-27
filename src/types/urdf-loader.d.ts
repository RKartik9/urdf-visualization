declare module 'urdf-loader' {
  import * as THREE from 'three';

  export interface URDFJoint {
    name: string;
    type: number;
    setJointValue: (value: number) => void;
  }

  export interface URDFRobot extends THREE.Object3D {
    joints: { [key: string]: URDFJoint };
    materials: { [key: string]: THREE.Material };
  }

  export default class URDFLoader {
    constructor(manager?: THREE.LoadingManager);
    load(url: string, onLoad: (robot: URDFRobot) => void, onError?: (error: Error) => void): void;
  }
}
