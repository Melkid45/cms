import { blockDefinitions } from "./schema";
import { renderBlock } from "./render";
import training from "../assets/images/photo.png";
import strength from "../assets/images/services/1.png";
import nutrition from "../assets/images/services/2.png";
import online from "../assets/images/services/3.png";
const assets = { training, strength, nutrition, online };
const choice = document.querySelector<HTMLSelectElement>("#block-choice")!;
const canvas = document.querySelector<HTMLElement>("#block-canvas")!;
blockDefinitions.forEach((block) => { const option = document.createElement("option"); option.value = block.id; option.textContent = `${block.family} / ${block.label}`; choice.append(option); });
function render() { const block = blockDefinitions.find((block) => block.id === choice.value)!; canvas.innerHTML = renderBlock(`cms/${block.id}`, block.defaultContent, assets); }
choice.addEventListener("change", render);
render();
