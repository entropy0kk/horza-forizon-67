import * as THREE from 'three';
import * as CANNON from 'cannon-es';

class Game {
    constructor() {
        // Scene Setup
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1;
        document.getElementById('app').appendChild(this.renderer.domElement);

        // Physics Setup
        this.world = new CANNON.World();
        this.world.gravity.set(0, -9.82, 0);
        this.world.broadphase = new CANNON.SAPBroadphase(this.world);
        this.clock = new THREE.Clock();

        // Assets
        this.wheels = [];
        this.wheelVisuals = [];
        this.inputs = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            brake: false
        };

        this.initLights();
        this.initEnvironment();
        this.initVehicle();
        this.initControls();

        window.addEventListener('resize', this.onResize.bind(this));
        this.animate();
    }

    initLights() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambientLight);

        const sunLight = new THREE.DirectionalLight(0xffffff, 1.5);
        sunLight.position.set(100, 200, 100);
        sunLight.castShadow = true;

        // Shadow optimization
        sunLight.shadow.mapSize.width = 2048;
        sunLight.shadow.mapSize.height = 2048;
        sunLight.shadow.camera.left = -50;
        sunLight.shadow.camera.right = 50;
        sunLight.shadow.camera.top = 50;
        sunLight.shadow.camera.bottom = -50;
        sunLight.shadow.camera.near = 0.5;
        sunLight.shadow.camera.far = 500;
        this.scene.add(sunLight);
    }

    initEnvironment() {
        // Ground
        const groundSize = 2000;
        const groundGeo = new THREE.PlaneGeometry(groundSize, groundSize, 10, 10);
        const groundMat = new THREE.MeshStandardMaterial({
            color: 0x222222,
            roughness: 0.9,
            metalness: 0.1
        });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);

        const groundBody = new CANNON.Body({
            mass: 0,
            shape: new CANNON.Plane(),
            material: new CANNON.Material('groundMaterial')
        });
        groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
        this.world.addBody(groundBody);
        this.groundMaterial = groundBody.material;

        // Sky and Fog
        this.scene.background = new THREE.Color(0x87ceeb);
        this.scene.fog = new THREE.Fog(0x87ceeb, 20, 1000);

        // Grid for orientation
        const grid = new THREE.GridHelper(groundSize, 100, 0xffffff, 0x444444);
        grid.position.y = 0.05;
        this.scene.add(grid);
    }

    initVehicle() {
        // Chassis
        const chassisShape = new CANNON.Box(new CANNON.Vec3(1, 0.5, 2));
        const chassisBody = new CANNON.Body({ mass: 1500 });
        chassisBody.addShape(chassisShape);
        chassisBody.position.set(0, 4, 0);
        chassisBody.angularVelocity.set(0, 0, 0.5); // Slight kickstart

        // Vehicle
        this.vehicle = new CANNON.RaycastVehicle({
            chassisBody: chassisBody,
            indexRightAxis: 0,
            indexUpAxis: 1,
            indexForwardAxis: 2
        });

        // Wheel options
        const options = {
            radius: 0.4,
            directionLocal: new CANNON.Vec3(0, -1, 0),
            suspensionStiffness: 30,
            suspensionRestLength: 0.3,
            frictionSlip: 1.4,
            dampingRelaxation: 2.3,
            dampingCompression: 4.4,
            maxSuspensionForce: 100000,
            rollInfluence: 0.01,
            axleLocal: new CANNON.Vec3(-1, 0, 0),
            chassisConnectionPointLocal: new CANNON.Vec3(1, 1, 0),
            maxSuspensionTravel: 0.3,
            customSlidingRotationalSpeed: -30,
            useCustomSlidingRotationalSpeed: true
        };

        // Front Left
        options.chassisConnectionPointLocal.set(-1, -0.4, 1.5);
        this.vehicle.addWheel(options);

        // Front Right
        options.chassisConnectionPointLocal.set(1, -0.4, 1.5);
        this.vehicle.addWheel(options);

        // Rear Left
        options.chassisConnectionPointLocal.set(-1, -0.4, -1.5);
        this.vehicle.addWheel(options);

        // Rear Right
        options.chassisConnectionPointLocal.set(1, -0.4, -1.5);
        this.vehicle.addWheel(options);

        this.vehicle.addToWorld(this.world);

        // Visuals
        const chassisGeo = new THREE.BoxGeometry(2, 1, 4);
        const chassisMat = new THREE.MeshStandardMaterial({ color: 0xff0000, metalness: 0.8, roughness: 0.2 });
        this.chassisMesh = new THREE.Mesh(chassisGeo, chassisMat);
        this.chassisMesh.castShadow = true;
        this.scene.add(this.chassisMesh);

        // Wheel Visuals
        const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.4, 32);
        wheelGeo.rotateZ(Math.PI / 2);
        const wheelMat = new THREE.MeshStandardMaterial({ color: 0x333333 });

        this.vehicle.wheelInfos.forEach(() => {
            const wheelMesh = new THREE.Mesh(wheelGeo, wheelMat);
            wheelMesh.castShadow = true;
            this.scene.add(wheelMesh);
            this.wheelVisuals.push(wheelMesh);
        });

        // Contact Material
        const wheelMaterial = new CANNON.Material('wheelMaterial');
        const wheelGroundContactMaterial = new CANNON.ContactMaterial(wheelMaterial, this.groundMaterial, {
            friction: 0.3,
            restitution: 0,
            contactEquationStiffness: 1000
        });
        this.world.addContactMaterial(wheelGroundContactMaterial);
    }

    initControls() {
        window.addEventListener('keydown', (e) => {
            switch (e.key.toLowerCase()) {
                case 'w': case 'arrowup': this.inputs.forward = true; break;
                case 's': case 'arrowdown': this.inputs.backward = true; break;
                case 'a': case 'arrowleft': this.inputs.left = true; break;
                case 'd': case 'arrowright': this.inputs.right = true; break;
                case ' ': this.inputs.brake = true; break;
            }
        });

        window.addEventListener('keyup', (e) => {
            switch (e.key.toLowerCase()) {
                case 'w': case 'arrowup': this.inputs.forward = false; break;
                case 's': case 'arrowdown': this.inputs.backward = false; break;
                case 'a': case 'arrowleft': this.inputs.left = false; break;
                case 'd': case 'arrowright': this.inputs.right = false; break;
                case ' ': this.inputs.brake = false; break;
            }
        });
    }

    updateVehicle() {
        const engineForce = 1500;
        const maxSteerVal = 0.5;
        const brakeForce = 100;

        // Drive
        if (this.inputs.forward) {
            this.vehicle.applyEngineForce(-engineForce, 2);
            this.vehicle.applyEngineForce(-engineForce, 3);
        } else if (this.inputs.backward) {
            this.vehicle.applyEngineForce(engineForce, 2);
            this.vehicle.applyEngineForce(engineForce, 3);
        } else {
            this.vehicle.applyEngineForce(0, 2);
            this.vehicle.applyEngineForce(0, 3);
        }

        // Steer
        if (this.inputs.left) {
            this.vehicle.setSteeringValue(maxSteerVal, 0);
            this.vehicle.setSteeringValue(maxSteerVal, 1);
        } else if (this.inputs.right) {
            this.vehicle.setSteeringValue(-maxSteerVal, 0);
            this.vehicle.setSteeringValue(-maxSteerVal, 1);
        } else {
            this.vehicle.setSteeringValue(0, 0);
            this.vehicle.setSteeringValue(0, 1);
        }

        // Brake
        if (this.inputs.brake) {
            this.vehicle.setBrake(brakeForce, 0);
            this.vehicle.setBrake(brakeForce, 1);
            this.vehicle.setBrake(brakeForce, 2);
            this.vehicle.setBrake(brakeForce, 3);
        } else {
            this.vehicle.setBrake(0, 0);
            this.vehicle.setBrake(0, 1);
            this.vehicle.setBrake(0, 2);
            this.vehicle.setBrake(0, 3);
        }
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    animate() {
        requestAnimationFrame(this.animate.bind(this));

        const delta = this.clock.getDelta();
        this.world.step(1 / 60, delta);

        this.updateVehicle();

        // Sync visual chassis
        this.chassisMesh.position.copy(this.vehicle.chassisBody.position);
        this.chassisMesh.quaternion.copy(this.vehicle.chassisBody.quaternion);

        // Sync wheels
        for (let i = 0; i < this.vehicle.wheelInfos.length; i++) {
            this.vehicle.updateWheelTransform(i);
            const t = this.vehicle.wheelInfos[i].worldTransform;
            this.wheelVisuals[i].position.copy(t.position);
            this.wheelVisuals[i].quaternion.copy(t.quaternion);
        }

        // Follow Camera
        const carPos = this.vehicle.chassisBody.position;
        const carQuat = this.vehicle.chassisBody.quaternion;

        const cameraOffset = new THREE.Vector3(0, 3, -8);
        cameraOffset.applyQuaternion(new THREE.Quaternion(carQuat.x, carQuat.y, carQuat.z, carQuat.w));

        this.camera.position.lerp(new THREE.Vector3(carPos.x, carPos.y, carPos.z).add(cameraOffset), 0.1);
        this.camera.lookAt(carPos.x, carPos.y, carPos.z);

        // UI Speed
        const speedKmh = Math.floor(Math.abs(this.vehicle.chassisBody.velocity.length() * 3.6));
        document.getElementById('speed').innerText = speedKmh;

        this.renderer.render(this.scene, this.camera);
    }
}

new Game();
