import { existsSync } from 'fs';
import { join } from 'path';
import { readFile, mkdir, writeFile } from 'fs/promises';
import { GlobalFonts, createCanvas, loadImage } from '@napi-rs/canvas';

const assetPath = join(__dirname, 'assets', 'modFrames');

export const modRarityMap = {
    common: 'Bronze',
    uncommon: 'Silver',
    rare: 'Gold',
    legendary: 'Legendary',
    riven: 'Omega',
};

export const getTier = (mod: any): string => {
    if (mod.type.includes('Riven')) return modRarityMap.riven;
    if (mod.name.includes('Archon')) return modRarityMap.rare;
    return (modRarityMap as Record<string, string>)[mod.rarity?.toLocaleLowerCase() ?? 'common'];
};

export const flip = async (image: any): Promise<any> => {
    const canvas = createCanvas(image.width, image.height);
    const context = canvas.getContext('2d');
    context.translate(image.width, 0);
    context.scale(-1, 1);
    context.drawImage(image, 0, 0);
    return loadImage(await canvas.encode('png'));
};

const downloadModPiece = async (name: string): Promise<Buffer> => {
    const base = 'https://cdn.warframestat.us/genesis/modFrames';
    const image = await fetch(`${base}/${name}`);
    const blob = await image.blob();
    return Buffer.from(await blob.arrayBuffer());
};

export const fetchModPiece = async (name: string): Promise<any> => {
    const filePath = join(assetPath, name);
    if (existsSync(filePath)) {
        const image = await readFile(filePath);
        return loadImage(image);
    }
    const image = await downloadModPiece(name);
    if (!existsSync(assetPath)) await mkdir(assetPath, { recursive: true });
    await writeFile(filePath, image);
    return loadImage(image);
};

export const getFrame = async (tier: string) => {
    return {
        cornerLights: await fetchModPiece(`${tier}CornerLights.png`),
        bottom: await fetchModPiece(`${tier}FrameBottom.png`),
        top: await fetchModPiece(`${tier}FrameTop.png`),
        sideLights: await fetchModPiece(`${tier}SideLight.png`),
    };
};

export const getBackground = async (tier: string) => {
    const isRiven = tier === 'Omega';
    const background = isRiven ? 'LegendaryBackground.png' : `${tier}Background.png`;
    const backer = isRiven ? 'RivenTopRightBacker.png' : `${tier}TopRightBacker.png`;
    const lowerTab = isRiven ? 'RivenLowerTab.png' : `${tier}LowerTab.png`;
    return {
        background: await fetchModPiece(background),
        backer: await fetchModPiece(backer),
        lowerTab: await fetchModPiece(lowerTab),
    };
};

export const fetchPolarity = async (polarity: string): Promise<any> => {
    const filePath = join(assetPath, `${polarity}.png`);
    if (existsSync(filePath)) {
        const image = await readFile(filePath);
        return loadImage(image);
    }
    const base = 'https://cdn.warframestat.us/genesis/img/polarities';
    const res = await fetch(`${base}/${polarity}.png`);
    const image = Buffer.from(await (await res.blob()).arrayBuffer());
    if (!existsSync(assetPath)) await mkdir(assetPath, { recursive: true });
    await writeFile(join(assetPath, `${polarity}.png`), image);
    return loadImage(image);
};

export const modDescription = (description: string | undefined, levelStats: any[] | undefined, rank: number): string | undefined => {
    if (description && description.length !== 0) return description;
    if (levelStats?.[rank]) {
        const { stats } = levelStats[rank];
        let desc = '';
        for (let i = 0; i < stats.length; i += 1) {
            desc = desc.concat(`${stats[i]} \n`);
        }
        return desc;
    }
};

export const wrapText = (context: any, text: string, maxWidth: number): string[] => {
    const words = text.split(' ');
    let currentLine = '';
    const lines: string[] = [];
    words.forEach((word) => {
        const testLine = `${currentLine} ${word}`;
        const testLineWidth = context.measureText(testLine).width;
        if (testLineWidth > maxWidth) {
            lines.push(currentLine);
            currentLine = word;
        } else {
            currentLine = testLine;
        }
    });
    lines.push(currentLine);
    return lines;
};

export const registerFonts = (): void => {
    const fontPath = join(__dirname, 'assets', 'fonts');
    GlobalFonts.registerFromPath(join(fontPath, 'Roboto-Light.ttf'), 'Roboto');
    GlobalFonts.registerFromPath(join(fontPath, 'Roboto-Regular.ttf'), 'Roboto');
    GlobalFonts.registerFromPath(join(fontPath, 'Roboto-Bold.ttf'), 'Roboto');
};

export const tierColor: Record<string, string> = {
    Bronze: '#CA9A87',
    Silver: '#FFFFFF',
    Gold: '#FAE7BE',
    Omega: '#AC83D5',
};

export const textColor = (tier: string): string => {
    if (tier === 'Legendary') return tierColor.Silver;
    return tierColor[tier];
};

export const exportCanvas = async (canvas: any, output: any = { format: 'png' }): Promise<Buffer | undefined> => {
    const quality = output.quality || output.cfg?.quality;
    if (quality !== undefined && (quality < 0 || quality > 100)) {
        throw new Error('quality cannot be less than 0 or more than 100');
    }
    try {
        switch (output.format) {
            case 'png': return await canvas.encode('png');
            case 'webp': return await canvas.encode('webp', output.quality);
            case 'jpeg': return await canvas.encode('jpeg', output.quality);
            case 'avif': return await canvas.encode('avif', output.cfg);
        }
    } catch {
        throw Error(`failed to export canvas as ${output.format}`);
    }
};
