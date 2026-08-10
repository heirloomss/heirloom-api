import { InternalServerErrorException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Networks } from '@stellar/stellar-sdk';
import { StellarService } from '../src/stellar/stellar.service';

/**
 * ConfigService stub. Heirloom is self-custodial: there is NO signing key, so
 * the only thing that decides whether the on-chain layer is live is the
 * presence of a contract id (the RPC URL always has a default).
 */
function configWith(values: Record<string, string>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

/** No contract id -> service is "not configured" (endpoints must 503). */
function unconfigured(): ConfigService {
  return configWith({
    STELLAR_NETWORK: 'testnet',
    STELLAR_RPC_URL: 'https://soroban-testnet.stellar.org',
    HEIRLOOM_CONTRACT_ID: '',
  });
}

/** A contract id present -> service is live (no network call at construction). */
function configured(
  network = 'testnet',
  contractId = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
): ConfigService {
  return configWith({
    STELLAR_NETWORK: network,
    STELLAR_RPC_URL: 'https://soroban-testnet.stellar.org',
    HEIRLOOM_CONTRACT_ID: contractId,
  });
}

describe('StellarService', () => {
  describe('configuration state', () => {
    it('is not configured when the contract id is absent', () => {
      const service = new StellarService(unconfigured());
      expect(service.isConfigured()).toBe(false);
      expect(service.getContractId()).toBeNull();
    });

    it('is configured when the contract id is present', () => {
      const service = new StellarService(configured());
      expect(service.isConfigured()).toBe(true);
      expect(service.getContractId()).toBe(
        'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
      );
    });
  });

  describe('networkPassphrase()', () => {
    it('maps the network name to the correct passphrase', () => {
      expect(new StellarService(configured('testnet')).networkPassphrase()).toBe(Networks.TESTNET);
      expect(new StellarService(configured('mainnet')).networkPassphrase()).toBe(Networks.PUBLIC);
      expect(new StellarService(configured('futurenet')).networkPassphrase()).toBe(
        Networks.FUTURENET,
      );
    });
  });

  describe('resolveTokenContract()', () => {
    let service: StellarService;
    beforeEach(() => {
      service = new StellarService(configured());
    });

    it('resolves "native" to the network XLM SAC address', () => {
      const native = service.resolveTokenContract('native');
      expect(native).toBe(new StellarService(configured()).resolveTokenContract(''));
      expect(native).toMatch(/^C[A-Z2-7]{55}$/);
    });

    it('treats "XLM" and empty input as native too', () => {
      const native = service.resolveTokenContract('native');
      expect(service.resolveTokenContract('XLM')).toBe(native);
      expect(service.resolveTokenContract(undefined)).toBe(native);
    });

    it('passes an existing C... contract address through unchanged', () => {
      const c = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
      expect(service.resolveTokenContract(c)).toBe(c);
    });

    it('rejects an unrecognized token descriptor', () => {
      expect(() => service.resolveTokenContract('not-a-token')).toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('when not configured, on-chain calls fail clearly (503)', () => {
    let service: StellarService;
    beforeEach(() => {
      service = new StellarService(unconfigured());
    });

    it('build endpoints throw ServiceUnavailableException', async () => {
      await expect(service.buildDeposit('GID', 1n)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      await expect(service.buildFinalizeRelease('GID', 1n)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      await expect(service.buildCancelLegacy('GID', 1n)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('views throw ServiceUnavailableException', async () => {
      await expect(service.getLegacy(1n)).rejects.toBeInstanceOf(ServiceUnavailableException);
      await expect(service.getApprovals(1n)).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('submit throws ServiceUnavailableException — never a fabricated hash', async () => {
      await expect(service.submit('AAAA')).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });
});
