import { cartography, clamp } from './mathUtils';
import { vec2, vec3, vec4, mat4 } from "gl-matrix";

export class MapQuadTreeNode {
    //TODO #minDepth so now lower res than this is shown (but textures can be lower)
    #minDepth = 4; //starts from 0
    #octreeMaxDepth = 19;
    #corners: vec3[] = [];
    #sizeOnScreen: number = 0.0;

    private renderer: any;
    public z: number;
    public x: number;
    public y: number;
    public isRight: number;
    public isDown: number;
    public children: (MapQuadTreeNode | null)[];
    public img: any | null;
    public squareMesh: any | null;
    public imageUrl: string;

    constructor(renderer: any, z = 0, x = 0, y = 0, isRight = 0, isDown = 0) {
        this.renderer = renderer;
        this.z = z;
        this.x = x;
        this.y = y;
        this.isRight = isRight;
        this.isDown = isDown;
        this.children = [null, null, null, null];
        this.img = null;
        this.squareMesh = null;
        this.imageUrl = `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
        // this.imageUrl = `https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}.png`;

        this.#initVertices();
        this.#addInitialChildNodes();
    }

    #initVertices() {
        const webmercatorVerts = cartography.getTileCorners(this.z, this.x, this.y);

        this.#corners = [
            cartography.latLonAltToECEF(webmercatorVerts.lowerLeft.lat, webmercatorVerts.lowerLeft.lon, 0.0),
            cartography.latLonAltToECEF(webmercatorVerts.lowerRight.lat, webmercatorVerts.lowerRight.lon, 0.0),
            cartography.latLonAltToECEF(webmercatorVerts.upperLeft.lat, webmercatorVerts.upperLeft.lon, 0.0),
            cartography.latLonAltToECEF(webmercatorVerts.upperRight.lat, webmercatorVerts.upperRight.lon, 0.0),
        ]

        this.squareMesh = this.renderer.addMapTile(
            this.imageUrl,
            this.#corners,
        );
    }

    #addInitialChildNodes() {
        const tiles = [
            { x: 0, y: 0 }, // Top-left
            { x: 1, y: 0 }, // Top-right
            { x: 0, y: 1 }, // Bottom-left
            { x: 1, y: 1 }  // Bottom-right
        ];

        if (this.z + 1 <= this.#minDepth) {
            for (let i = 0; i < 4; i++) {
                if (this.children[i] == null) {
                    const newX = 2 * this.x + tiles[i].x;
                    const newY = 2 * this.y + tiles[i].y;
                    this.children[i] = new MapQuadTreeNode(this.renderer, this.z + 1, newX, newY, tiles[i].x, tiles[i].y);
                }
            }
        }
    }

    #addChildNodes() {
        const tiles = [
            { x: 0, y: 0 }, // Top-left
            { x: 1, y: 0 }, // Top-right
            { x: 0, y: 1 }, // Bottom-left
            { x: 1, y: 1 }  // Bottom-right
        ];

        for (let i = 0; i < 4; i++) {
            if (this.children[i] == null) {
                const newX = 2 * this.x + tiles[i].x;
                const newY = 2 * this.y + tiles[i].y;
                this.children[i] = new MapQuadTreeNode(this.renderer, this.z + 1, newX, newY, tiles[i].x, tiles[i].y);
            }
        }
    }

    #deleteChildNodes() {
        //dont delte over minDepth
        // Implement deletion logic here
    }

    #triangleSizeOnScreen(corner1: vec2, corner2: vec2, corner3: vec2): number {
        let area = 0.5 * Math.abs(
            corner1[0] * (corner2[1] - corner3[1]) +
            corner2[0] * (corner3[1] - corner1[1]) +
            corner3[0] * (corner1[1] - corner2[1])
        );
        return area;
    }

    #clampVec2ToNDC(vec: vec2): vec2 {
        return vec2.fromValues(clamp(vec[0], -1, 1), clamp(vec[1], -1, 1));
    }

    #computeSizeOnScreen(mvpMatrix: mat4): number {
        const screenSpaceCorners: vec2[] = [];

        this.#corners.forEach(corner => {
            const cornerVec4 = vec4.fromValues(corner[0], corner[1], corner[2], 1);
            const transformedVec4 = vec4.create();
            vec4.transformMat4(transformedVec4, cornerVec4, mvpMatrix);

            const transformedVec = vec2.fromValues(
                transformedVec4[0] / transformedVec4[3],
                transformedVec4[1] / transformedVec4[3],
                // transformedVec4[2] / transformedVec4[3]
            );
            screenSpaceCorners.push(this.#clampVec2ToNDC(transformedVec));
        });

        var area = this.#triangleSizeOnScreen(screenSpaceCorners[0], screenSpaceCorners[1], screenSpaceCorners[2]) // first triangle
        area += this.#triangleSizeOnScreen(screenSpaceCorners[2], screenSpaceCorners[1], screenSpaceCorners[3]) // second triangle
        return area
    }

    renderQuadTree(mvpMatrix: mat4) {
        this.#sizeOnScreen = this.#computeSizeOnScreen(mvpMatrix)

        var hasTexture = 0
        for (let i = 0; i < 4; i++) {
            if (this.children[i]) {
                if (this.children[i]?.squareMesh) {
                    if (this.children[i]?.squareMesh.textureLoaded) {
                        hasTexture += 1
                    }
                }
            }
        }

        if (hasTexture < 4) {
            this.renderer.drawSquareMesh(this.squareMesh);
        } else {
            for (let i = 0; i < 4; i++) {
                if (this.children[i]) {
                    this.children[i]!.renderQuadTree(mvpMatrix)
                }
            }
        }
    }

    update() {
        // if (some condition) {
        // console.log('thissize', this.#sizeOnScreen)
        if (this.z < this.#octreeMaxDepth && this.#sizeOnScreen > 0.4) {
            // console.log('trying to add children to ', this.z, this.x, this.y)
            this.#addChildNodes()
        }
        // } else {
        //     this.deleteChildNodes()
        // }

        for (let i = 0; i < 4; i++) {
            if (this.children[i]) {
                this.children[i]!.update();
            }
        }
    }
}
