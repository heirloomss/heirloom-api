import { ConfigService } from '@nestjs/config';
import { StellarService } from '../src/stellar/stellar.service';

/** ConfigService stub with no keys -> simulated mode. */
function simulatedConfig(): ConfigService {
  const values: Record<string, string> = {
    STELLAR_NETWORK: 'testnet',
    STELLAR_RPC_URL: 'https://soroban-testnet.stellar.org',
    STELLAR_SECRET_KEY: '',
    HEIRLOOM_CONTRACT_ID: '',
  };
  return { get: (k: string) => values[k] } as unknown as ConfigService;
}

describe('StellarService (simulated mode)', () => {
  let service: StellarService;

  beforeEach(() => {
    service = new StellarService(simulatedConfig());
  });

  it('runs in simulated mode when keys are absent', () => {
    expect(service.isSimulated()).toBe(true);
  });

  it('returns deterministic fake tx hashes', async () => {
    const a = await service.createLegacy({
      owner: 'GOWNER',
      token: 'native',
      amount: '1000',
      guardians: [{ address: 'GGUARD', name: 'Brother' }],
      threshold: 1,
      beneficiaries: [{ address: 'GBENE', shareBps: 10000 }],
    });
    const b = await service.createLegacy({
      owner: 'GOWNER',
      token: 'native',
      amount: '1000',
      guardians: [{ address: 'GGUARD', name: 'Brother' }],
      threshold: 1,
      beneficiaries: [{ address: 'GBENE', shareBps: 10000 }],
    });

    expect(a.simulated).toBe(true);
    expect(a.txHash).toEqual(b.txHash); // deterministic
    expect(a.txHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces distinct hashes for distinct operations', async () => {
    const approve = await service.approveGuardian('GOWNER', 'GGUARD');
    const claim = await service.claimAssets('GOWNER', 'GBENE');
    expect(approve.txHash).not.toEqual(claim.txHash);
  });
});
