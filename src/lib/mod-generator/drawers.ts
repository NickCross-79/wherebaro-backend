import { fetchPolarity, fetchModPiece, textColor, wrapText, modRarityMap, modDescription, flip, getTier } from './utils';

export const verticalPad = 70;
export const horizantalPad = 7;

const drawPolarity = async (tier: string, polarity: string): Promise<any> => {
    const { createCanvas, loadImage } = require('@napi-rs/canvas');
    const image = await fetchPolarity(polarity);
    const size = 32;
    const canvas = createCanvas(size, size);
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    context.globalCompositeOperation = 'source-in';
    context.fillStyle = textColor(tier);
    context.fillRect(0, 0, size, size);
    return loadImage(await canvas.encode('png'));
};

export const backerImage = async (props: any): Promise<any> => {
    const { createCanvas, loadImage } = require('@napi-rs/canvas');
    const { backer, tier, base, polarity, rank } = props;
    const canvas = createCanvas(backer.width, backer.height);
    const context = canvas.getContext('2d');
    context.drawImage(backer, 0, 0);
    context.font = 'bold 14px "Roboto"';
    context.fillStyle = textColor(tier);
    const drainHeight = canvas.height * 0.7;
    if (tier === modRarityMap.riven) {
        context.fillText('???', canvas.width * 0.4, drainHeight);
        return loadImage(await canvas.encode('png'));
    }
    if (polarity === 'universal') {
        context.fillText('??', canvas.width * 0.6, canvas.height * 0.7);
    } else {
        context.drawImage(await drawPolarity(tier, polarity), canvas.width * 0.6, canvas.height * 0.2, 16, 16);
    }
    const drain = `${base < 0 ? '+' : ''}${Math.abs(base) + (rank ?? 0)}`;
    if (drain.length >= 2) {
        context.fillText(`${drain}`, canvas.width * 0.2, drainHeight);
    } else {
        context.fillText(`${drain}`, canvas.width * 0.35, drainHeight);
    }
    return loadImage(await canvas.encode('png'));
};

export const lowerTabImage = async (props: any): Promise<any> => {
    const { createCanvas, loadImage } = require('@napi-rs/canvas');
    const { lowerTab, tier, compatName } = props;
    const canvas = createCanvas(lowerTab.width, lowerTab.height);
    const context = canvas.getContext('2d');
    context.drawImage(lowerTab, 0, 0);
    if (compatName) {
        context.font = '300 16px "Roboto"';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillStyle = textColor(tier);
        context.fillText(compatName, canvas.width * 0.5, canvas.height * 0.5);
    }
    return loadImage(await canvas.encode('png'));
};

export const backgroundImage = async (props: any): Promise<any> => {
    const { createCanvas, loadImage } = require('@napi-rs/canvas');
    const { background, sideLights, backer, lowerTab, bottom, mod, rank, image } = props;
    const tier = getTier(mod);
    const canvas = createCanvas(background.width, background.height);
    const context = canvas.getContext('2d');
    context.drawImage(background, 0, 0);
    if (mod.imageName || image) {
        const thumb = await loadImage(image ?? `https://cdn.warframestat.us/img/${mod.imageName}`);
        const thumbWidth = canvas.width - horizantalPad * 2;
        const thumbHeight = 170;
        context.drawImage(thumb, horizantalPad, canvas.height * 0.17, thumbWidth, thumbHeight);
    }
    const sideLightsY = background.height * 0.21;
    const sideLightsLeft = await flip(sideLights);
    context.drawImage(sideLights, canvas.width * 0.93, sideLightsY);
    context.drawImage(sideLightsLeft, 0, sideLightsY);
    context.drawImage(
        await backerImage({ backer, tier, base: mod.baseDrain, polarity: mod.polarity, rank }),
        background.width * 0.8, background.height * 0.2
    );
    const padding = tier === modRarityMap.riven ? 16 : 8;
    context.drawImage(
        await lowerTabImage({ lowerTab, tier, compatName: mod.compatName }),
        background.width * 0.09, background.height - bottom.height - padding
    );
    context.fillStyle = textColor(tier);
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    // Title text
    context.font = '400 22px "Roboto"';
    context.fillText(mod.name, canvas.width * 0.5, canvas.height * 0.55);
    // Stat text
    const description = modDescription(mod.description, mod.levelStats, rank ?? 0);
    if (description && description.length > 0) {
        const x = canvas.width * 0.5;
        const lines = [description.replace(/\\n|\n/g, ' ')];
        context.font = '16px "Roboto"';
        let start = canvas.height * 0.59;
        lines.forEach((line) => {
            const maxWidth = background.width * 0.9;
            const texts = wrapText(context, line, maxWidth);
            texts.forEach((text) => {
                context.fillText(text, x, start, maxWidth);
                start += 20;
            });
        });
    }
    return loadImage(await canvas.encode('png'));
};

export const bottomImage = async (props: any): Promise<any> => {
    const { createCanvas, loadImage } = require('@napi-rs/canvas');
    const { bottom, cornerLights, tier, max, rank } = props;
    const rankSlotEmpty = await fetchModPiece('RankSlotEmpty.png');
    const rankCompleted = await fetchModPiece('RankCompleteLine.png');
    const rankSlotActive = await fetchModPiece('RankSlotActive.png');
    const canvas = createCanvas(bottom.width, bottom.height);
    const context = canvas.getContext('2d');
    context.drawImage(bottom, 0, 0);
    const cornerLightsLeft = await flip(cornerLights);
    if (tier === modRarityMap.riven) {
        const cornerLightsHeight = canvas.height * 0.27;
        context.drawImage(cornerLights, canvas.width * 0.73, cornerLightsHeight);
        context.drawImage(cornerLightsLeft, canvas.width * 0.04, cornerLightsHeight);
    } else if (tier === modRarityMap.legendary) {
        const cornerLightsHeight = canvas.height * 0.32;
        context.drawImage(cornerLights, canvas.width * 0.76, cornerLightsHeight);
        context.drawImage(cornerLightsLeft, -(canvas.width * 0.01), cornerLightsHeight);
    } else {
        const cornerLightsHeight = canvas.height * 0.24;
        context.drawImage(cornerLights, canvas.width * 0.76, cornerLightsHeight);
        context.drawImage(cornerLightsLeft, -(canvas.width * 0.01), cornerLightsHeight);
    }
    const isRare = tier === modRarityMap.riven || tier === modRarityMap.legendary;
    const slotLineHeight = isRare ? canvas.height * 0.84 : canvas.height * 0.74;
    const slotHeight = isRare ? canvas.height * 0.82 : canvas.height * 0.72;
    const maxRank = max > 10 ? 10 : max;
    if (rank === maxRank) context.drawImage(rankCompleted, 0, slotLineHeight);
    let rankSlotStart = canvas.width * 0.29;
    if (maxRank <= 3) rankSlotStart = canvas.width * 0.43;
    if (maxRank <= 5 && maxRank >= 4) rankSlotStart = canvas.width * 0.39;
    for (let i = 0; i < maxRank; i += 1) {
        const slot = i < (rank ?? 0) ? rankSlotActive : rankSlotEmpty;
        context.drawImage(slot, rankSlotStart, slotHeight);
        rankSlotStart += 11;
    }
    return loadImage(await canvas.encode('png'));
};
