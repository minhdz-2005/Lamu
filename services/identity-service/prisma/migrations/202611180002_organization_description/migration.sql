-- Keep the nullable column if the application is rolled back.
ALTER TABLE "organizations" ADD COLUMN "description" TEXT;
