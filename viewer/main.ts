// Classic (non-module) build of the Factorio chartbundle map viewer, bundled by
// Vite into a single IIFE so the offline archive works straight from file://
// (no dev server, no ES modules, no fetch). Ported from factorio.com's
// /static/chartbundle/chartbundle.js with three offline changes:
//   1. the map bundle is read from an embedded base64 global (window
//      .__CHARTBUNDLE_DATA__) and unzipped in-memory with fflate (the same zip
//      library the archiver itself uses), instead of an HTTP range request,
//   2. tiles are pulled straight from that in-memory map, and
//   3. texture loaders use an empty crossOrigin so file:// icons load.
import { unzipSync } from "fflate";
import * as THREE from "three";
import { MapControls } from "three/examples/jsm/controls/MapControls.js";
import { GUI } from "three/examples/jsm/libs/lil-gui.module.min.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";

function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToDataUri(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return "data:image/png;base64," + btoa(binary);
}

var scene;
var camera;
var renderer;
var target;
var controls;
var gui;
var bundle; // unzipped map: { "chartbundle/...": Uint8Array }
var bundleInfo;
var guiData;
var chartSprites = new Array();
var loadingInfo;
var spritesLoadedCount;
var spritesTotalCount;
var planetsSelector;
var labelRenderer;
var chartbundleOpts;
var currentChartName;
var currentChartInfo;

async function initChartbundleViewer(opts) {
  chartbundleOpts = opts;

  scene = new THREE.Scene();
  target = document.getElementById("chartbundle-map-canvas");
  loadingInfo = document.getElementById("chartbundle-loading");
  planetsSelector = document.getElementById("chartbundle-planets");

  renderer = new THREE.WebGLRenderer({ antialias: true, canvas: target });
  renderer.setSize(target.getBoundingClientRect().width, target.getBoundingClientRect().height);
  renderer.setClearColor(chartbundleOpts.bg, 1);

  if (chartbundleOpts.debug) {
    labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(target.getBoundingClientRect().width, target.getBoundingClientRect().height);
    labelRenderer.domElement.style.position = "absolute";
    labelRenderer.domElement.style.top = "0";
    labelRenderer.domElement.style.left = "0";
    labelRenderer.domElement.style.pointerEvents = "none";
    target.parentElement.appendChild(labelRenderer.domElement);
  }

  camera = new THREE.PerspectiveCamera(80, renderer.domElement.width / renderer.domElement.height, 0.1, 10000);
  camera.up.set(0, 0, 1);
  resizeRendererToDisplaySize(true);
  adaptCameraToDisplaySize();
  window.addEventListener("resize", () => {
    if (resizeRendererToDisplaySize()) {
      adaptCameraToDisplaySize();
    }
  });
  scene.add(camera);

  controls = new MapControls(camera, renderer.domElement);
  controls.screenSpacePanning = false;
  controls.enableRotate = false;
  controls.zoomSpeed = 2;
  controls.zoomToCursor = true;
  controls.maxDistance = chartbundleOpts.max_z;
  controls.minDistance = chartbundleOpts.min_z;
  controls.listenToKeyEvents(window);

  // Unzip the embedded bundle in-memory (no network).
  if (!window.__CHARTBUNDLE_DATA__) {
    loadingInfo.textContent = "Map bundle data missing (assets/chartbundles/chartbundle-data.js).";
    return;
  }
  bundle = unzipSync(base64ToBytes(window.__CHARTBUNDLE_DATA__));
  bundleInfo = JSON.parse(new TextDecoder().decode(bundle["chartbundle/info.json"]));
  var chartNames = bundleInfo.charts.filter((chart) => chart.type == chartbundleOpts.type).map((chart) => chart.id);

  if (chartNames.length == 0) {
    loadingInfo.textContent = `No charts of type ${chartbundleOpts.type} found.`;
    return;
  }
  const chartname = chartNames[0];

  for (const button of planetsSelector.children) {
    const chartId = button.getAttribute("data-chartid");
    button.addEventListener("click", () => loadSelectedChart(chartId));
  }

  gui = new GUI();
  if (!chartbundleOpts.debug) {
    gui.hide();
  }

  guiData = {
    chartname: chartNames[0],
    camera_x: camera.position.x,
    camera_y: camera.position.y,
    camera_z: camera.position.z,
    zoom: camera.zoom,
    zoomSpeed: 2,
  };

  gui.add(guiData, "chartname", chartNames).onChange(loadSelectedChart);
  gui.add(guiData, "camera_x", camera.position.x).listen().disable();
  gui.add(guiData, "camera_y", camera.position.y).listen().disable();
  gui.add(guiData, "camera_z", camera.position.z).listen().disable();
  gui.add(guiData, "zoom", camera.zoom).listen().disable();
  gui.add(guiData, "zoomSpeed", controls.zoomSpeed).listen().disable();

  loadSelectedChart(chartname);
  render();
}

async function loadSelectedChart(chartname) {
  const chartInfo = bundleInfo.charts.find((chart) => chart.id == chartname);
  currentChartName = chartname;
  currentChartInfo = chartInfo;

  const chartPrefix = `chartbundle/charts/${chartname}/`;
  const tileNames = Object.keys(bundle).filter((k) => k.startsWith(chartPrefix) && k.endsWith(".png"));

  spritesTotalCount = tileNames.length;
  spritesLoadedCount = 0;
  loadingInfo.style.display = "block";

  for (const button of planetsSelector.children) {
    button.classList.remove("active");
    if (button.getAttribute("data-chartid") == chartname) {
      button.classList.add("active");
    }
  }

  if (chartInfo == null) {
    console.log(`chart ${chartname} not found`);
    return;
  }

  // remove camera from controls so it doesn't mess with manual positioning
  controls.object = new THREE.OrthographicCamera();
  controls.reset();
  var chartCenter = new THREE.Vector3(chartInfo.center[0], chartInfo.center[1], 0);
  camera.position.set(chartCenter.x, chartCenter.y, chartbundleOpts.initial_z);
  camera.lookAt(new THREE.Vector3(chartCenter.x, chartCenter.y, 0));
  camera.updateProjectionMatrix();
  controls.target.set(chartCenter.x, chartCenter.y, 0);
  controls.object = camera;
  controls.update();

  for (let textureIdx = 0; textureIdx < chartSprites.length; textureIdx++) {
    scene.remove(chartSprites[textureIdx]);
  }
  chartSprites = new Array();

  const loader = new THREE.TextureLoader();
  loader.crossOrigin = ""; // allow file:// textures
  const chartChunkPositions = new Array();
  for (const tileName of tileNames) {
    const match = tileName.slice(chartPrefix.length).match(/(-?\d+)_(-?\d+)/);
    if (match) {
      chartChunkPositions.push({ x: parseInt(match[1]!, 10), y: parseInt(match[2]!, 10) });
    } else {
      console.log("invalid tile name", tileName);
    }
  }
  chartChunkPositions.sort((a, b) => Math.abs(a.x) + Math.abs(a.y) - (Math.abs(b.x) + Math.abs(b.y)));
  for (const chartChunkPosition of chartChunkPositions) {
    const x = chartChunkPosition.x;
    const y = chartChunkPosition.y;
    const posx = (x + 0.5) * chartInfo.tiles_per_chunk * chartInfo.tiles_per_pixel;
    const posy = -(y + 0.5) * chartInfo.tiles_per_chunk * chartInfo.tiles_per_pixel;
    const chartChunkWidth = chartInfo.tiles_per_chunk * chartInfo.tiles_per_pixel;
    const chartChunkHeight = chartInfo.tiles_per_chunk * chartInfo.tiles_per_pixel;

    if (chartbundleOpts.debug) {
      const label = createLabel(`(${x}, ${y}) - (${posx}, ${posy})`);
      label.position.set(posx, posy, 2);
      scene.add(label);
      chartSprites.push(label);

      const gridGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-chartChunkWidth / 2, -chartChunkHeight / 2, 0),
        new THREE.Vector3(-chartChunkWidth / 2, chartChunkHeight / 2, 0),
        new THREE.Vector3(chartChunkWidth / 2, chartChunkHeight / 2, 0),
        new THREE.Vector3(chartChunkWidth / 2, -chartChunkHeight / 2, 0),
        new THREE.Vector3(-chartChunkWidth / 2, -chartChunkHeight / 2, 0),
      ]);
      const grid = new THREE.Line(gridGeometry, new THREE.LineBasicMaterial({ color: 0x0000ff }));
      grid.position.set(posx, posy, 1);
      grid.frustumCulled = false;
      scene.add(grid);
      chartSprites.push(grid);
    }

    // Read the tile straight from the in-memory map as a data URI.
    const textureBlob = bytesToDataUri(bundle[`${chartPrefix}${x}_${y}.png`]);

    const activeChartname = chartname;
    loader.load(
      textureBlob,
      (texture) => {
        if (activeChartname != currentChartName) return;
        texture.minFilter = THREE.NearestFilter;
        texture.magFilter = THREE.NearestFilter;
        texture.colorSpace = THREE.SRGBColorSpace;
        const material = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(texture.image.width, texture.image.height, 1);
        sprite.position.set(posx, posy, 0);
        scene.add(sprite);
        chartSprites.push(sprite);
        spritesLoadedCount += 1;
      },
      undefined,
      (err) => {
        console.log("error while loading texture", x, y, err);
        spritesLoadedCount += 1;
      },
    );
  }

  loadRecipeIcons(chartInfo);
}

function loadRecipeIcons(chartInfo) {
  const activeChartname = chartInfo.id;
  const loader = new THREE.TextureLoader();
  loader.crossOrigin = ""; // allow file:// icon textures
  if (!("crafting_machines" in chartInfo)) {
    console.log("chartbundle contains no recipe information");
    return;
  }
  spritesTotalCount += chartInfo.crafting_machines.length;

  for (const recipeInfo of chartInfo.crafting_machines) {
    const iconPath = `chartbundle/icons/recipe/${recipeInfo.recipe.name}.png`;
    if (!(iconPath in chartbundleOpts.icons)) {
      console.log("no icon for", iconPath);
      continue;
    }

    const processedIconPath = chartbundleOpts.icons[iconPath];
    const iconUrl = `${chartbundleOpts.cdn}/${processedIconPath}`;
    loader.load(
      iconUrl,
      (texture) => {
        if (activeChartname != currentChartName) return;
        texture.colorSpace = THREE.SRGBColorSpace;
        const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
        for (let index = 0; index < recipeInfo.items.length; index++) {
          const item = recipeInfo.items[index];
          const sprite = new THREE.Sprite(material);
          const scale = item.scale ? 2.5 * chartInfo.tiles_per_pixel * (item.scale / 100.0) : 2.5 * chartInfo.tiles_per_pixel;
          sprite.scale.set(scale * chartInfo.tiles_per_pixel, scale * chartInfo.tiles_per_pixel, 1);
          sprite.position.set(item.position[0], -item.position[1], 1);
          scene.add(sprite);
          sprite.renderOrder = index;
          chartSprites.push(sprite);
          spritesLoadedCount += 1;
        }
      },
      undefined,
      (err) => {
        spritesLoadedCount += 1;
        console.log("error while loading texture", iconPath, processedIconPath, err);
      },
    );
  }
}

function clampCamera() {
  if (currentChartInfo == null) return;
  const topLeft = new THREE.Vector2(currentChartInfo.left_top[0], -currentChartInfo.left_top[1]);
  const bottomRight = new THREE.Vector2(currentChartInfo.right_bottom[0], -currentChartInfo.right_bottom[1]);

  if (camera.position.x < topLeft.x || camera.position.x > bottomRight.x || camera.position.y > topLeft.y || camera.position.y < bottomRight.y) {
    if (camera.position.x < topLeft.x) camera.position.x = topLeft.x;
    if (camera.position.x > bottomRight.x) camera.position.x = bottomRight.x;
    if (camera.position.y > topLeft.y) camera.position.y = topLeft.y;
    if (camera.position.y < bottomRight.y) camera.position.y = bottomRight.y;

    camera.lookAt(new THREE.Vector3(camera.position.x, camera.position.y, 0));
    camera.updateProjectionMatrix();
    controls.target.set(camera.position.x, camera.position.y, 0);
    controls.update();
  }
}

function createLabel(message) {
  const div = document.createElement("p");
  div.className = "label";
  div.textContent = message;
  div.style.marginTop = "-1em";
  div.style.color = "black";
  div.style.fontSize = "12px";
  div.style.padding = "2px";
  div.style.backgroundColor = "rgba(255, 255, 255, 0.2)";
  const label = new CSS2DObject(div);
  label.visible = true;
  return label;
}

function resizeRendererToDisplaySize(force?) {
  const canvas = renderer.domElement;
  const targetBounds = renderer.domElement.parentElement.getBoundingClientRect();
  const pixelRatio = window.devicePixelRatio;
  const width = Math.floor(targetBounds.width * pixelRatio);
  const height = Math.floor(targetBounds.height * pixelRatio);
  const needResize = canvas.width !== width || canvas.height !== height;
  if (needResize || force) {
    renderer.setSize(width, height);
    if (chartbundleOpts.debug) labelRenderer.setSize(targetBounds.width, targetBounds.height);
  }
  return needResize;
}

function updateZoomSpeed() {
  const minSpeed = 4;
  const maxSpeed = 12;
  const alpha = (camera.position.z - chartbundleOpts.min_z) / chartbundleOpts.max_z;
  controls.zoomSpeed = THREE.MathUtils.lerp(minSpeed, maxSpeed, alpha);
}

function adaptCameraToDisplaySize() {
  const canvas = renderer.domElement;
  camera.aspect = canvas.width / canvas.height;
  camera.updateProjectionMatrix();
}

function render() {
  if (resizeRendererToDisplaySize(renderer)) adaptCameraToDisplaySize();
  if (spritesLoadedCount >= spritesTotalCount) {
    loadingInfo.style.display = "none";
  } else {
    loadingInfo.textContent = `Loaded ${spritesLoadedCount}/${spritesTotalCount} sprites`;
  }
  updateZoomSpeed();
  clampCamera();
  controls.update();
  renderer.render(scene, camera);
  if (chartbundleOpts.debug) {
    guiData.camera_x = camera.position.x;
    guiData.camera_y = camera.position.y;
    guiData.camera_z = camera.position.z;
    guiData.zoom = camera.zoom;
    guiData.zoomSpeed = controls.zoomSpeed.toFixed(2);
    labelRenderer.render(scene, camera);
  }
  requestAnimationFrame(render);
}

window.initChartbundleViewer = initChartbundleViewer;
