import { Global, Module } from '@nestjs/common';
import { StellarService } from './stellar.service';

/**
 * Global so both guardians and legacy can invoke the Soroban contract without
 * re-importing.
 */
@Global()
@Module({
  providers: [StellarService],
  exports: [StellarService],
})
export class StellarModule {}
