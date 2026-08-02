import { NotFoundException } from '@nestjs/common';
import { BeneficiariesService } from '../src/beneficiaries/beneficiaries.service';
import { ActivityService } from '../src/activity/activity.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ActivityType } from '../src/activity/activity.constants';

describe('BeneficiariesService', () => {
  let prisma: {
    beneficiary: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };
  let activity: { record: jest.Mock };
  let service: BeneficiariesService;

  beforeEach(() => {
    prisma = {
      beneficiary: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    activity = { record: jest.fn().mockResolvedValue(undefined) };
    service = new BeneficiariesService(
      prisma as unknown as PrismaService,
      activity as unknown as ActivityService,
    );
  });

  it('creates a beneficiary scoped to the user and logs the activity', async () => {
    const dto = {
      name: 'Sarah',
      relationship: 'Daughter',
      email: 'sarah@example.com',
      allocationPercentage: 40,
    };
    prisma.beneficiary.create.mockResolvedValue({ id: 'b1', userId: 'u1', ...dto });

    const result = await service.create('u1', dto);

    expect(prisma.beneficiary.create).toHaveBeenCalledWith({
      data: { ...dto, userId: 'u1' },
    });
    expect(activity.record).toHaveBeenCalledWith(
      'u1',
      ActivityType.BENEFICIARY_ADDED,
      expect.stringContaining('Sarah'),
    );
    expect(result.id).toBe('b1');
  });

  it('throws NotFound when the beneficiary belongs to another user', async () => {
    prisma.beneficiary.findFirst.mockResolvedValue(null);
    await expect(service.findOne('u1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deletes a beneficiary it owns and logs removal', async () => {
    prisma.beneficiary.findFirst.mockResolvedValue({ id: 'b1', userId: 'u1', name: 'Sarah' });
    prisma.beneficiary.delete.mockResolvedValue({ id: 'b1' });

    const result = await service.remove('u1', 'b1');

    expect(prisma.beneficiary.delete).toHaveBeenCalledWith({ where: { id: 'b1' } });
    expect(activity.record).toHaveBeenCalledWith(
      'u1',
      ActivityType.BENEFICIARY_REMOVED,
      expect.stringContaining('Sarah'),
    );
    expect(result).toEqual({ success: true });
  });
});
