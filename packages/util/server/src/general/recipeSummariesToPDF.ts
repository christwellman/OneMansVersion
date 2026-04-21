import _pdfmake from "pdfmake";
import {
  parseNotes,
  parsePairedRecipe,
  parseTableCells,
  ParsedNote,
  stripImageTokens,
} from "@recipesage/util/shared";
import { sanitizeRemoveHtmlFromString } from "./sanitizeRemoveHtmlFromString";
import { fetchURL } from "../general/fetch";
import { Content, Margins, TDocumentDefinitions } from "pdfmake/interfaces";
import path from "path";
import { RecipeSummary } from "@recipesage/prisma";
import { readFile } from "fs/promises";
import process from "node:process";
import { setTimeout } from "node:timers/promises";

const FONT_PATH = process.env.FONTS_PATH;
if (!FONT_PATH) throw new Error("FONTS_PATH must be provided");

// DefinitelyTyped hasn't been updated for pdfmake 0.3.x yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pdfmake = _pdfmake as any;

pdfmake.addFonts({
  NotoSans: {
    normal: path.resolve(FONT_PATH, "Noto_Sans/NotoSans-Regular.ttf"),
    bold: path.resolve(FONT_PATH, "Noto_Sans/NotoSans-Bold.ttf"),
    italics: path.resolve(FONT_PATH, "Noto_Sans/NotoSans-Italic.ttf"),
    bolditalics: path.resolve(FONT_PATH, "Noto_Sans/NotoSans-BoldItalic.ttf"),
  },
});

export interface ExportOptions {
  includePrimaryImage?: boolean;
  includeImageUrls?: boolean;
}

const inlineFormattingRegex =
  /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|__(.+?)__)/g;

const applyInlineFormattingPdfmake = (text: string): Content => {
  const segments: Content[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(inlineFormattingRegex)) {
    if (match.index > lastIndex) {
      segments.push(text.slice(lastIndex, match.index));
    }

    if (match[2]) {
      segments.push({ text: match[2], bold: true, italics: true });
    } else if (match[3]) {
      segments.push({ text: match[3], bold: true });
    } else if (match[4]) {
      segments.push({ text: match[4], italics: true });
    } else if (match[5]) {
      segments.push({ text: match[5], decoration: "underline" });
    }

    lastIndex = match.index + match[0].length;
  }

  if (segments.length === 0) return text;

  if (lastIndex < text.length) {
    segments.push(text.slice(lastIndex));
  }

  return { text: segments };
};

const parsedToSchema = (
  parsedItems: { content: string; isHeader: boolean }[],
  includeMargin: boolean,
): Content[] => {
  return parsedItems.map((item) => ({
    text: applyInlineFormattingPdfmake(stripImageTokens(item.content)),
    bold: item.isHeader,
    margin: includeMargin ? ([0, 0, 0, 5] satisfies Margins) : undefined,
  }));
};

const parsedInstructionsToSchema = (
  parsedItems: { content: string; isHeader: boolean; count: number }[],
): Content[] => {
  return parsedItems.map((item) => {
    const body = applyInlineFormattingPdfmake(stripImageTokens(item.content));
    return {
      text: item.isHeader
        ? body
        : [{ text: `${item.count}. `, bold: true }, body],
      bold: item.isHeader,
      margin: [0, 0, 0, 5] satisfies Margins,
    };
  });
};

const parsedNotesToSchema = (parsedNotes: ParsedNote[]): Content[] => {
  return parsedNotes.map((note) => {
    if (note.isTable) {
      const lines = note.content.split("\n");
      const headerRow = lines[0];
      const bodyRows = lines.slice(2);

      const headerCells = parseTableCells(headerRow.trim());
      const body: string[][] = [headerCells];
      for (const row of bodyRows) {
        const cells = parseTableCells(row.trim());
        const padded = headerCells.map((_, i) => cells[i] ?? "");
        body.push(padded);
      }

      return {
        table: {
          headerRows: 1,
          body: body.map((row, rowIdx) =>
            row.map((cell) =>
              rowIdx === 0
                ? {
                    text: applyInlineFormattingPdfmake(stripImageTokens(cell)),
                    bold: true,
                  }
                : {
                    text: applyInlineFormattingPdfmake(stripImageTokens(cell)),
                  },
            ),
          ),
        },
        margin: [0, 4, 0, 4] satisfies Margins,
      };
    }
    return {
      text: applyInlineFormattingPdfmake(stripImageTokens(note.content)),
      bold: note.isHeader,
    };
  });
};

const buildNutritionTableRows = (recipe: RecipeSummary): Content[][] => {
  const rows: [string, number | null, string][] = [
    ["Calories", recipe.nutritionCalories, "kcal"],
    ["Total Fat", recipe.nutritionTotalFat, "g"],
    ["Saturated Fat", recipe.nutritionSaturatedFat, "g"],
    ["Trans Fat", recipe.nutritionTransFat, "g"],
    ["Polyunsaturated Fat", recipe.nutritionPolyunsaturatedFat, "g"],
    ["Monounsaturated Fat", recipe.nutritionMonounsaturatedFat, "g"],
    ["Cholesterol", recipe.nutritionCholesterol, "mg"],
    ["Sodium", recipe.nutritionSodium, "mg"],
    ["Total Carbohydrates", recipe.nutritionTotalCarbs, "g"],
    ["Dietary Fiber", recipe.nutritionDietaryFiber, "g"],
    ["Total Sugars", recipe.nutritionTotalSugars, "g"],
    ["Added Sugars", recipe.nutritionAddedSugars, "g"],
    ["Protein", recipe.nutritionProtein, "g"],
    ["Vitamin D", recipe.nutritionVitaminD, "mcg"],
    ["Calcium", recipe.nutritionCalcium, "mg"],
    ["Iron", recipe.nutritionIron, "mg"],
    ["Potassium", recipe.nutritionPotassium, "mg"],
  ];
  return rows
    .filter(([, value]) => value != null)
    .map(([label, value, unit]) => [
      { text: label, bold: true },
      { text: `${value} ${unit}` },
    ]);
};

const recipeToSchema = async (
  recipe: RecipeSummary,
  options?: ExportOptions,
): Promise<Content> => {
  const schema: Content[] = [];

  const headerContent: Content[] = [];

  headerContent.push({
    text: recipe.title || "",
    fontSize: 16,
  });

  const showTagLine =
    recipe.source || recipe.activeTime || recipe.totalTime || recipe.yield;
  if (showTagLine) {
    const tagline: [string, string][] = [];

    if (recipe.source) tagline.push(["Source:", recipe.source]);
    if (recipe.activeTime) tagline.push(["Active time:", recipe.activeTime]);
    if (recipe.totalTime) tagline.push(["Total time:", recipe.totalTime]);
    if (recipe.yield) tagline.push(["Yield:", recipe.yield]);

    const taglineSchema = tagline.reduce((acc, item) => {
      return [
        ...acc,
        {
          text: item[0] + " ",
          bold: true,
        },
        {
          text: item[1] + "  ",
        },
      ];
    }, [] as Content[]);

    headerContent.push({
      text: taglineSchema,
      margin: [0, 10, 0, 10], // left top right bottom
    });
  }

  if (recipe.description) {
    headerContent.push({
      text: recipe.description,
      margin: [0, showTagLine ? 0 : 10, 0, 10], // left top right bottom
    });
  }

  const primaryImageUrl = recipe.recipeImages[0]?.image.location;
  if (primaryImageUrl && options?.includePrimaryImage) {
    try {
      let buffer: Buffer;
      if (
        process.env.NODE_ENV === "selfhost" &&
        primaryImageUrl.startsWith("/")
      ) {
        buffer = await readFile(primaryImageUrl);
      } else {
        const response = await fetchURL(primaryImageUrl, {
          timeout: 15 * 1000,
        });
        buffer = await response.buffer();
      }

      schema.push({
        columns: [
          {
            width: 100,
            image: `data:image/jpeg;base64,${buffer.toString("base64")}`,
            fit: [100, 100],
          },
          {
            width: "auto",
            stack: headerContent,
            margin: [10, 10, 0, 0],
          },
        ],
        margin: [0, 0, 0, 10],
      });
    } catch (_e) {
      schema.push(...headerContent);
    }
  } else {
    schema.push(...headerContent);
  }

  const parsed = parsePairedRecipe(
    sanitizeRemoveHtmlFromString(recipe.ingredients || ""),
    sanitizeRemoveHtmlFromString(recipe.instructions || ""),
    1,
  );
  const parsedNotes = parseNotes(
    sanitizeRemoveHtmlFromString(recipe.notes || ""),
  );
  if (parsed.mode === "paired") {
    for (const group of parsed.groups) {
      schema.push({
        text: group.title,
        bold: true,
        margin: [0, 8, 0, 4] satisfies Margins,
      });
      schema.push({
        columns: [
          {
            width: 180,
            stack: parsedToSchema(group.ingredients, true),
          },
          {
            width: "auto",
            stack: parsedInstructionsToSchema(group.instructions),
          },
        ],
        margin: [0, 0, 0, 6] satisfies Margins,
      });
    }
  } else if (recipe.ingredients && recipe.instructions) {
    schema.push({
      columns: [
        {
          width: 180,
          stack: parsedToSchema(parsed.ingredients, true),
        },
        {
          width: "auto",
          stack: parsedInstructionsToSchema(parsed.instructions),
        },
      ],
    });
  } else if (recipe.ingredients) {
    schema.push({
      stack: parsedToSchema(parsed.ingredients, true),
    });
  } else if (recipe.instructions) {
    schema.push({
      stack: parsedInstructionsToSchema(parsed.instructions),
    });
  }

  if (recipe.notes) {
    const header = {
      text: "Notes:",
      margin: [0, 10, 0, 5] satisfies Margins, // left top right bottom
      bold: true,
    };
    schema.push(header);
    schema.push(...parsedNotesToSchema(parsedNotes));
  }
  const nutritionRows = buildNutritionTableRows(recipe);
  if (nutritionRows.length > 0 || recipe.nutritionOtherDetails) {
    schema.push({
      text: "Nutrition (per serving):",
      margin: [0, 10, 0, 5] satisfies Margins,
      bold: true,
    });
    if (recipe.nutritionServingSize) {
      schema.push({
        text: [
          { text: "Serving Size: ", bold: true },
          { text: recipe.nutritionServingSize },
        ],
        margin: [0, 0, 0, 5] satisfies Margins,
      });
    }
    if (nutritionRows.length > 0) {
      schema.push({
        table: {
          headerRows: 0,
          widths: ["*", "auto"],
          body: nutritionRows,
        },
        layout: {
          hLineWidth: (i, node) =>
            i === 0 || i === node.table.body.length ? 0 : 1,
          vLineWidth: () => 0,
          hLineColor: () => "#aaa",
          paddingLeft: (i) => (i === 0 ? 0 : 8),
          paddingRight: (i, node) =>
            i === (node.table.widths?.length ?? 0) - 1 ? 0 : 8,
        },
        margin: [0, 0, 0, 5] satisfies Margins,
      });
    }
    if (recipe.nutritionOtherDetails) {
      schema.push({
        text: [
          { text: "Other Nutrition Details: ", bold: true },
          { text: recipe.nutritionOtherDetails },
        ],
        margin: [0, 5, 0, 0] satisfies Margins,
      });
    }
  }
  if (recipe.url) {
    schema.push({
      text: [
        {
          text: "Source URL: ",
          bold: true,
        },
        {
          text: recipe.url,
          link: recipe.url,
        },
      ],
      margin: [0, 10, 0, 0],
    });
  }
  const otherImageUrls = recipe.recipeImages.map((el) => el.image.location);
  // Primary image is already included
  if (options?.includePrimaryImage) otherImageUrls.splice(0, 1);
  if (options?.includeImageUrls) {
    for (const imageUrl of otherImageUrls) {
      schema.push({
        text: [
          {
            text: "Image URL: ",
            bold: true,
          },
          {
            text: imageUrl,
            link: imageUrl,
          },
        ],
        margin: [0, 10, 0, 0],
      });
    }
  }

  return schema;
};

export async function* recipeAsyncIteratorToPDF(
  recipes: AsyncIterable<RecipeSummary>,
  options?: ExportOptions,
) {
  for await (const recipe of recipes) {
    const content: Content[] = [await recipeToSchema(recipe, options)];

    const docDefinition: TDocumentDefinitions = {
      content,
      defaultStyle: {
        font: "NotoSans",
        fontSize: 10,
        lineHeight: 1.2,
      },
    };

    const doc = pdfmake.createPdf(docDefinition);
    const stream = await doc.getStream();
    stream.end();

    yield {
      stream,
      recipe,
    };

    await setTimeout(50);
  }
}
