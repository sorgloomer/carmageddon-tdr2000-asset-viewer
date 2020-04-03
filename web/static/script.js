var camera, scene, renderer;
var geometry, defaultMaterial, mesh;
var controls, urlParams;

function init() {
    urlParams = parseUrlParams();
    if (!urlParams.map) {
        window.location.href = "?map=HollowoodMesh";
        return;
    }
    camera = new THREE.PerspectiveCamera( 70, window.innerWidth / window.innerHeight, 0.5, 5000 );
    camera.position.x = 20;
    camera.position.y = 200;
    camera.position.z = 2000;


    scene = new THREE.Scene();

    geometry = new THREE.BoxGeometry( 200, 200, 200 );
    defaultMaterial = new THREE.MeshBasicMaterial({
        vertexColors: THREE.VertexColors,
    });

    mesh = new THREE.Mesh( geometry, defaultMaterial );
    scene.add( mesh );

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize( window.innerWidth, window.innerHeight );
    document.body.appendChild( renderer.domElement );

    controls = new THREE.MapControls( camera, renderer.domElement );
    //controls.addEventListener( 'change', render ); // call this only in static scenes (i.e., if there is no animation loop)
    controls.enableDamping = true; // an animation loop is required when either damping or auto-rotation are enabled
    controls.dampingFactor = 0.25;
    controls.screenSpacePanning = false;
    controls.minDistance = 5;
    controls.maxDistance = 1500;
    controls.maxPolarAngle = Math.PI / 2;
    controls.rotateSpeed = 0.20;
    controls.panSpeed = 0.25;


    load();
}

function dataViewFrom(buffer) {
    if (buffer instanceof ArrayBuffer) {
        return new DataView(buffer.buffer);
    }
    return new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

function toUint8Array(data) {
    if (data instanceof Uint8Array) return data;
    return new Uint8Array(data);
}
class BetterDataView {
    constructor(data) {
        this.data = toUint8Array(data);
        this.view = dataViewFrom(this.data);
        this.byteLength = this.data.length;
        this.littleEndian = true;
    }
    getBytes(offset, length) {
        return this.data.slice(offset, offset + length);
    }
    getU16(offset) {
        return this.view.getUint16(offset, this.littleEndian);
    }
    getU32(offset) {
        return this.view.getUint32(offset, this.littleEndian);
    }
    getF32(offset) {
        return this.view.getFloat32(offset, this.littleEndian);
    }
}

class MshsParser {
    constructor(data) {
        this.data = new BetterDataView(data);
        this.offset = 0;
    }
    skipGeometries(count) {
        for (var i = 0; i < count; i++) {
            this.skipGeometry();
        }
    }
    skipGeometry() {
        const triangleCount = this.data.getU16(this.offset);
        const vertexCount = this.data.getU32(this.offset + 20);
        this.offset += 24 + vertexCount * 36 + triangleCount * 12;
    }
    readGeometry() {
        const triangleCount = this.data.getU16(this.offset);
        const vertexCount = this.data.getU32(this.offset + 20);
        this.offset += 24;
        var geom = new THREE.Geometry();
        geom.uvs = [];
        this.readVerticesInto(geom, vertexCount);
        this.readFacesInto(geom, triangleCount);
        this.fixupColors(geom);
        this.fixCenter(geom);
        return geom;
    }
    fixCenter(geom) {
        geom.computeBoundingBox();
        geom.originalCenter = new THREE.Vector3(0, 0, 0);
        geom.boundingBox.getCenter(geom.originalCenter);
        geom.translate(-geom.originalCenter.x, -geom.originalCenter.y, -geom.originalCenter.z);
    }
    readGeometries(count) {
        var result = [];
        for (var i = 0; i < count; i++) {
            result.push(this.readGeometry());
        }
        return result;
    }
    readAllGeometries() {
        var result = [];
        while (this.hasNext()) {
            result.push(this.readGeometry());
        }
        return result;
    }
    fixupColors(geom) {
        geom.faces.forEach(face => {
            face.vertexColors[0] = geom.colors[face.a];
            face.vertexColors[1] = geom.colors[face.b];
            face.vertexColors[2] = geom.colors[face.c];
        });
    }
    readVerticesInto(geom, count) {
        for (var i = 0; i < count; i++) {
            this.readVertexInto(geom);
        }
    }
    readFacesInto(geom, count) {
        for (var i = 0; i < count; i++) {
            const i0 = this.data.getU32(this.offset);
            const i1 = this.data.getU32(this.offset + 4);
            const i2 = this.data.getU32(this.offset + 8);
            this.offset += 12;
            geom.faces.push(new THREE.Face3( i0, i1, i2 ));
            geom.faceVertexUvs[0].push([
                geom.uvs[i0],
                geom.uvs[i1],
                geom.uvs[i2],
            ]);
        }
    }
    readVertexInto(geom) {
        geom.vertices.push(new THREE.Vector3(
            this.data.getF32(this.offset + 0),
            this.data.getF32(this.offset + 4),
            this.data.getF32(this.offset + 8),
        ));
        geom.colors.push(new THREE.Color(
            this.data.getF32(this.offset + 20),
            this.data.getF32(this.offset + 16),
            this.data.getF32(this.offset + 12),
        ));
        geom.uvs.push(new THREE.Vector2(
            this.data.getF32(this.offset + 28),
            1-this.data.getF32(this.offset + 32),
        ));
        this.offset += 36;
    }

    hasNext() {
        return this.offset < this.data.byteLength;
    }
}


const HEX = "0123456789abcdef";
function byte_to_hex(val) {
    val = val & 0xff;
    return HEX[(val >> 4)|0] + HEX[val & 0xf];
}
function bytes_to_hex(vals) {
    var result = "";
    for (var i = 0; i < vals.length; i++) {
        result += byte_to_hex(vals[i]);
    }
    return result;
}

async function getMeshGeometries(path) {
    const resp = await fetch(path);
    const contentBuffer = await resp.arrayBuffer();
    const content = new Uint8Array(contentBuffer);

    const parser = new MshsParser(content);
    return parser.readAllGeometries();
}

class TokenStream {
    constructor(contentText) {
        this.contentText = contentText;
        this.regex = /(?:[ \t\r\n;]|\/\/[^\n]*\n)*(?:([0-9.\-+]+)|("(?:[^"]|\\[\s\S])*")|([a-zA-Z_][a-zA-Z_0-9]*))/g;
        this.cursor = 0;
    }

    _match() {
        this.regex.lastIndex = this.cursor;
        const match = this.regex.exec(this.contentText);
        if (!match || match.index !== this.cursor) {
            throw new Error("TokenStream error");
        }
        this.cursor = this.regex.lastIndex;
        return match;
    }

    nextToken() {
        const match = this._match();
        if (!match) {
            return {type:"eos"};
        }
        if (match[1] !== undefined) {
            return {type:"number",value:+match[1]};
        }
        if (match[2] !== undefined) {
            return {type:"string",value:JSON.parse(match[2])};
        }
        if (match[3] !== undefined) {
            return {type:"name",value:match[3]};
        }
        return {type:"eos"};
    }
}

class CarmaScript {
    constructor(scriptText) {
        this.defines = new Map();
        this.defines.set("NULL", null);
        this.defines.set("true", true);
        this.defines.set("false", false);
        this.tokens = new TokenStream(scriptText);
    }
    nextAny() {
        const token = this.tokens.nextToken();
        switch (token.type) {
            case "number":
            case "string":
                return token.value;
            case "eos":
                return undefined;
            case "name":
                if (!this.defines.has(token.value)) {
                    throw new Error(`${token.value} not defined`);
                }
                return this.defines.get(token.value);
            default:
                throw new Error("unknown token type");
        }
    }

    _nextAnyTyped(expected) {
        const value = this.nextAny();
        const valueType = typeof value;
        if (valueType !== expected) {
            throw new Error(`Expected ${expected}, got ${valueType}`);
        }
        return value;
    }
    nextString() {
        return this._nextAnyTyped("string");
    }
    nextNumber() {
        return this._nextAnyTyped("number");
    }
    nextInt() {
        const value = this.nextNumber();
        if (!isInteger(value)) throw new Error("value is not integer");
        return value;
    }
    nextEos() {
        return this._nextAnyTyped("undefined");
    }
    nextNumberArray(count) {
        const result = [];
        for (var i = 0; i < count; i++) {
            result.push(this.nextNumber());
        }
        return result;
    }

    nextIntOrNull() {
        const result = this.nextAny();
        if (result !== null && !isInteger(result)) {
            throw new Error("int or null expected");
        }
        return result;
    }
}

function isInteger(x) {
    return typeof x === "number" && x === Math.floor(x);
}

function expect(x, msg) {
    if (!x) throw new Error(msg);
}
async function load() {
    const LEVEL = urlParams.map;
    const meshes = await getMeshGeometries(`Assets/${LEVEL}/${LEVEL}.mshs`);
    const resp = await fetch(`Assets/${LEVEL}/${LEVEL}.hie`);
    const data = await resp.text();
    const tokens = new CarmaScript(data);

    expect(tokens.nextString() === "Version", "Version header");
    expect(tokens.nextInt() === 3, "Version number 3");

    const cullNodes = [];
    const cullNodeCount = tokens.nextNumber();
    for (var i = 0; i < cullNodeCount; i++) {
        var cullNode = [];
        for (var j = 0; j < 10; j++) {
            cullNode.push(tokens.nextNumber());
        }
        cullNodes.push(cullNode);
    }

    const collisionDataMeshCount = tokens.nextInt();
    expect(collisionDataMeshCount === 0, "Number of collision data meshes");

    const lineCount = tokens.nextInt();
    expect(lineCount === 0, "Number of lines");

    const textureCount = tokens.nextInt();
    const textureNames = [];
    for (var i = 0; i < textureCount; i++) {
        textureNames.push(tokens.nextString());
    }

    const materialCount = tokens.nextInt();
    const materials = [];
    for (var i = 0; i < materialCount; i++) {
        var loadedMaterial = [];
        for (var j = 0; j < 5; j++) {
            loadedMaterial.push(tokens.nextNumber());
        }
        materials.push(loadedMaterial);
    }

    const matrixCount = tokens.nextInt();
    const matrices = [];
    for (var i = 0; i < matrixCount; i++) {
        const values = tokens.nextNumberArray(16);
        const newMatrix = new THREE.Matrix4();
        newMatrix.set(...values);
        newMatrix.transpose();
        matrices.push(newMatrix);
        expect(tokens.nextString() === "NONE", "Matrix name");
    }
    const meshCount = tokens.nextInt();
    const meshFile = tokens.nextString();
    expect(tokens.nextInt() === 0, "Number of expressions");

    const renderNodeCount = tokens.nextInt();
    const renderNodes = [];
    for (var i = 0; i < renderNodeCount; i++) {
        renderNodes.push({
            type: tokens.nextInt(),
            index: tokens.nextInt(),
            child: tokens.nextIntOrNull(),
            sibling: tokens.nextIntOrNull(),
        });
    }

    for (var i = 0; i < 10; i++) {
        console.log(
            "Type "+i+": "
            + _.max(
            renderNodes.filter(n => n.type === i).map(n => n.index)
            )
        );
    }
    const TEXTURE_LOADER = new THREE.TextureLoader();
    function textureMaterial(textureName) {
        if (!textureName) return defaultMaterial;
        const cache = textureMaterial.cache;
        var currentMaterial = cache.get(textureName);
        if (!currentMaterial) {
            var texture = TEXTURE_LOADER.load(`Assets/${LEVEL}/${textureName}.tx.png`);
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            currentMaterial = new THREE.MeshBasicMaterial({
                map: texture,
                vertexColors: THREE.VertexColors,
                transparent: true,
                side: THREE.DoubleSide,
            });
            cache.set(textureName, currentMaterial);
        }
        return currentMaterial;
    }
    textureMaterial.cache = new Map();

    function traverse(nodeIndex, context) {
        if (nodeIndex === null) return;
        const node = renderNodes[nodeIndex];
        const TYPE_GROUP = 1;
        const TYPE_TEXTURE = 2;
        const TYPE_MESH = 3;
        const TYPE_CULL = 8;
        const TYPE_MATERIAL = 5;
        switch (node.type) {
            case TYPE_GROUP:
                const newTransform = new THREE.Matrix4();
                newTransform.multiplyMatrices(context.transform, matrices[node.index]);
                traverseChildren(node, {
                    ...context,
                    transform: newTransform,
                });
                break;
            case TYPE_MESH:
                addObject(meshes[node.index], context);
                traverseChildren(node, context);
                break;
            case TYPE_TEXTURE:
                traverseChildren(node, {
                    ...context,
                    material: textureMaterial(textureNames[node.index]),
                });
                break;
            case TYPE_CULL:
                traverseChildren(node, {
                    ...context,
                    cullnode: node.index,
                });
                break;
            case TYPE_MATERIAL:
                traverseChildren(node, context);
                break;
            default:
                throw new Error(`unknown render node type ${node.type}`);
        }
    }

    var SPHERE = new THREE.SphereGeometry(20);
    function addObject(geom, context) {
        var material = new THREE.MeshBasicMaterial({
            color: (context.cullnode+3) * 0x123456
        });
        material = context.material;

        const center = new THREE.Vector3(0, 0, 0);
        geom.boundingBox.getCenter(center);

        const object = new THREE.Mesh(geom, material);
        object.matrixAutoUpdate = false;
        var m = new THREE.Matrix4();
        m.makeTranslation(geom.originalCenter.x, geom.originalCenter.y, geom.originalCenter.z);
        object.matrix.copy(context.transform);
        object.matrix.multiply(m);
        // object.matrix.makeTranslation(worldCenter.x, worldCenter.y, worldCenter.z);
        object.position.copy(center);
        scene.add(object);


        /*
        var cullNodeObj = new THREE.Mesh(new THREE.SphereGeometry(40), material);
        var cullNode = cullNodes[context.cullnode];
        cullNodeObj.matrixAutoUpdate = false;
        cullNodeObj.matrix.makeTranslation(cullNode[3], cullNode[4], cullNode[5]);
        cullNodeObj.position.applyMatrix4(cullNodeObj.matrix);
        console.log(cullNode);
        scene.add(cullNodeObj);

         */
    }

    function traverseChildren(node, transform) {
        var nodeIndex = node.child;
        while (nodeIndex !== null) {
            traverse(nodeIndex, transform);
            nodeIndex = renderNodes[nodeIndex].sibling;
        }
    }
    scene.remove( mesh );
    traverse(0, {
        transform: new THREE.Matrix4(),
        material: defaultMaterial,
        cullnode: null,
    });
}

const startTime = Date.now();
function animate() {
    const elapsedTime = (Date.now() - startTime) * 0.001;
    requestAnimationFrame( animate );

    controls.update();
    mesh.rotation.x += 0.01;
    mesh.rotation.y += 0.02;

    /*
    const D = ((Math.sin(elapsedTime * 0.83) + 1) / 2) * 490 + 10;
    const a = (Math.sin(elapsedTime * 0.143) + 1) * Math.PI / 5;
    const b = elapsedTime * 0.477;
    camera.position.x = D * Math.cos(b) * Math.cos(a);
      camera.position.y = D * Math.sin(a);
      camera.position.z = D * Math.sin(b) * Math.cos(a);
    camera.lookAt(0,0,0);
    */

    renderer.render( scene, camera );

}

function parseUrlParams() {
    var match,
        pl     = /\+/g,  // Regex for replacing addition symbol with a space
        search = /([^&=]+)=?([^&]*)/g,
        decode = function (s) { return decodeURIComponent(s.replace(pl, " ")); },
        query  = window.location.search.substring(1);

    var urlParams = {};
    while (match = search.exec(query))
        urlParams[decode(match[1])] = decode(match[2]);
    return urlParams;
}

window.addEventListener("load", main);

function main() {
    init();
    animate();
}