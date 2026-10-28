const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();
(async () => {
  const iv = await db.user.findFirst({ where: { role: "INTERVIEWER" } });
  const jobs = await db.jobOpening.findMany();
  if (iv && jobs.length) {
    await db.jobOpening.update({ where: { id: jobs[0].id }, data: { createdById: iv.id, createdByName: iv.name } });
    console.log("reassigned job", jobs[0].id, "to interviewer", iv.id);
  }
  await db.$disconnect();
})();
