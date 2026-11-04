import { expect, test } from "@playwright/test";
import { Document, Packer, Paragraph } from "docx";
import { prisma } from "@/lib/prisma";

const resumeText = "Анна Петрова. Менеджер продукта. С 2020 года вела разработку сервиса доставки, проводила интервью с пользователями, готовила требования и запускала новые функции. Координировала команду разработки и анализировала результаты запуска.";

test("direct upload requires consent and preserves its version in a synthetic DOCX", async ({ request }) => {
  const document = new Document({ sections: [{ children: [new Paragraph(resumeText)] }] });
  const file = await Packer.toBuffer(document);
  const multipart = { file: { name: "synthetic-resume.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: file } };

  const deniedText = await request.post("/api/resumes/text", { data: { text: resumeText } });
  expect(deniedText.status()).toBe(403);
  const deniedUpload = await request.post("/api/resumes/upload", { multipart });
  expect(deniedUpload.status()).toBe(403);

  const uploaded = await request.post("/api/resumes/upload", { headers: { "X-Resume-Consent": "v1" }, multipart });
  expect(uploaded.status()).toBe(200);
  const { resumeId } = await uploaded.json();
  const saved = await prisma.resume.findUniqueOrThrow({ where: { id: resumeId }, include: { versions: true } });
  expect(saved.sanitizedText).toContain("проводила интервью");
  expect(saved.versions[0].structuredContent).toMatchObject({ consentVersion: "v1" });
});

test("a synthetic PDF can be uploaded with consent", async ({ request, page }) => {
  await page.setContent("<p>Product Manager. Since 2020, I have led development of a delivery product, interviewed customers, prepared requirements, coordinated engineers and analyzed the results of each release.</p>");
  const pdf = await page.pdf({ format: "A4" });
  const response = await request.post("/api/resumes/upload", {
    headers: { "X-Resume-Consent": "v1" },
    multipart: { file: { name: "synthetic-resume.pdf", mimeType: "application/pdf", buffer: pdf } },
  });
  expect(response.status(), await response.text()).toBe(200);
  const { resumeId } = await response.json();
  const saved = await prisma.resume.findUniqueOrThrow({ where: { id: resumeId }, include: { versions: true } });
  expect(saved.sanitizedText).toContain("interviewed customers");
  expect(saved.versions[0].structuredContent).toMatchObject({ consentVersion: "v1" });
});
