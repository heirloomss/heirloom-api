-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "GuardianStatus" AS ENUM ('PENDING', 'VERIFIED', 'DECLINED');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('PROTECTED', 'RELEASED', 'CLAIMED');

-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('PASSPORT', 'BIRTH_CERTIFICATE', 'INSURANCE', 'HOUSE_DEED', 'MARRIAGE_CERTIFICATE', 'BUSINESS', 'TAX', 'PASSWORD_HINT', 'OTHER');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('LETTER', 'VIDEO', 'VOICE', 'PHOTO');

-- CreateEnum
CREATE TYPE "CheckInStatus" AS ENUM ('ACTIVE', 'MISSED', 'VERIFYING', 'RELEASED');

-- CreateEnum
CREATE TYPE "LegacyPlanStatus" AS ENUM ('DRAFT', 'PROTECTED', 'FUNDED', 'VERIFYING', 'VERIFIED', 'RELEASED', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT,
    "name" TEXT NOT NULL,
    "walletAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletChallenge" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Beneficiary" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "walletAddress" TEXT,
    "allocationPercentage" INTEGER NOT NULL DEFAULT 0,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Beneficiary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Guardian" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "walletAddress" TEXT,
    "status" "GuardianStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Guardian_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assetCode" TEXT NOT NULL,
    "amount" DECIMAL(20,7) NOT NULL,
    "recipientId" TEXT,
    "status" "AssetStatus" NOT NULL DEFAULT 'PROTECTED',
    "contractId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "DocumentCategory" NOT NULL DEFAULT 'OTHER',
    "fileUrl" TEXT NOT NULL,
    "encrypted" BOOLEAN NOT NULL DEFAULT true,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "MessageType" NOT NULL,
    "recipientId" TEXT,
    "title" TEXT NOT NULL,
    "contentEncrypted" TEXT,
    "contentIv" TEXT,
    "contentAuthTag" TEXT,
    "fileUrl" TEXT,
    "releaseRule" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckIn" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "intervalDays" INTEGER NOT NULL DEFAULT 90,
    "lastCheckIn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextCheckIn" TIMESTAMP(3) NOT NULL,
    "status" "CheckInStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegacyPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contractId" TEXT,
    "legacyId" BIGINT,
    "tokenAddress" TEXT,
    "totalAmount" DECIMAL(38,0),
    "threshold" INTEGER NOT NULL DEFAULT 2,
    "status" "LegacyPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LegacyPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_walletAddress_key" ON "User"("walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "WalletChallenge_nonce_key" ON "WalletChallenge"("nonce");

-- CreateIndex
CREATE INDEX "WalletChallenge_walletAddress_idx" ON "WalletChallenge"("walletAddress");

-- CreateIndex
CREATE INDEX "WalletChallenge_expiresAt_idx" ON "WalletChallenge"("expiresAt");

-- CreateIndex
CREATE INDEX "Beneficiary_userId_idx" ON "Beneficiary"("userId");

-- CreateIndex
CREATE INDEX "Guardian_userId_idx" ON "Guardian"("userId");

-- CreateIndex
CREATE INDEX "Asset_userId_idx" ON "Asset"("userId");

-- CreateIndex
CREATE INDEX "Asset_recipientId_idx" ON "Asset"("recipientId");

-- CreateIndex
CREATE INDEX "Document_userId_idx" ON "Document"("userId");

-- CreateIndex
CREATE INDEX "Message_userId_idx" ON "Message"("userId");

-- CreateIndex
CREATE INDEX "Message_recipientId_idx" ON "Message"("recipientId");

-- CreateIndex
CREATE UNIQUE INDEX "CheckIn_userId_key" ON "CheckIn"("userId");

-- CreateIndex
CREATE INDEX "CheckIn_nextCheckIn_idx" ON "CheckIn"("nextCheckIn");

-- CreateIndex
CREATE INDEX "CheckIn_status_idx" ON "CheckIn"("status");

-- CreateIndex
CREATE INDEX "ActivityLog_userId_idx" ON "ActivityLog"("userId");

-- CreateIndex
CREATE INDEX "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LegacyPlan_userId_key" ON "LegacyPlan"("userId");

-- AddForeignKey
ALTER TABLE "Beneficiary" ADD CONSTRAINT "Beneficiary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Guardian" ADD CONSTRAINT "Guardian_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "Beneficiary"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "Beneficiary"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegacyPlan" ADD CONSTRAINT "LegacyPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

