/**
 * Thin wrapper around @wfcd/mod-generator that avoids the TypeScript
 * `module: commonjs` problem where `import()` gets transpiled to `require()`.
 *
 * @wfcd/mod-generator is ESM-only and its dependency graph (warframe-items)
 * contains top-level await, which Node rejects when loaded via `require()`.
 *
 * Using `new Function` forces a true runtime ESM dynamic import that
 * TypeScript's CommonJS output does not transform.
 *
 * This module is a separate file so tests can mock it directly via
 * `jest.mock("../../services/modGeneratorLoader")`.
 */

/**
 * Generates a PNG image for a given Warframe mod item.
 * @param mod  - The mod metadata object from @wfcd/items.
 * @param rank - The mod rank to render (0 = unranked, max = fully ranked).
 * @returns A Buffer containing the PNG, or undefined if generation failed internally.
 */
export async function generateModImage(mod: any, rank: number): Promise<Buffer | undefined> {
    // eslint-disable-next-line no-new-func
    const { default: generate } = await (new Function("m", "return import(m)"))("@wfcd/mod-generator");
    return generate({ mod, output: { format: "png" }, rank });
}
