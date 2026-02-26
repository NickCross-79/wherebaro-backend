import { createCanvas } from '@napi-rs/canvas';
import { backgroundImage, bottomImage, horizantalPad, verticalPad } from './drawers';
import { exportCanvas, getBackground, getFrame, getTier, modRarityMap, registerFonts } from './utils';

const generate = async (mod: any, output: any = { format: 'png' }, rank?: number, image?: string): Promise<Buffer | undefined> => {
    const tier = getTier(mod);
    const isRiven = tier === modRarityMap.riven;
    const canvas = createCanvas(isRiven ? 292 : 256, 512);
    const context = canvas.getContext('2d');
    const { background, backer, lowerTab } = await getBackground(tier);
    const { cornerLights, bottom, top, sideLights } = await getFrame(tier);
    const centerX = (canvas.width - background.width) / 2;
    const centerY = (canvas.height - background.height) / 2;
    registerFonts();
    const backgroundGen = await backgroundImage({
        background, sideLights, backer, lowerTab,
        bottom: { width: bottom.width, height: bottom.height },
        mod, rank, image,
    });
    context.drawImage(backgroundGen, centerX, centerY);
    if (top.width > background.width) {
        const newXPadding = horizantalPad * 6;
        const widthDiff = top.width - background.width - newXPadding;
        context.drawImage(top, -widthDiff / 2, background.height * 0.14);
    } else {
        context.drawImage(top, centerX, background.height * 0.14);
    }
    if (bottom.width > background.width) {
        const newXPadding = horizantalPad * 6;
        const widthDiff = bottom.width - background.width - newXPadding;
        context.drawImage(await bottomImage({ bottom, cornerLights, tier, max: mod.fusionLimit, rank }), -widthDiff / 2, background.height * 0.65);
    } else {
        context.drawImage(await bottomImage({ bottom, cornerLights, tier, max: mod.fusionLimit, rank }), centerX, background.height * 0.65);
    }
    const outterCanvas = createCanvas(isRiven ? 292 : 256, 512 - verticalPad);
    const outterContext = outterCanvas.getContext('2d');
    outterContext.drawImage(canvas, (outterCanvas.width - canvas.width) / 2, (outterCanvas.height - canvas.height) / 2);
    return exportCanvas(outterCanvas, output);
};

export default generate;