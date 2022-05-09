mod exchange;
mod initialize;
mod tokenizer;

mod prelude {
    pub use anchor_lang::prelude::*;
    pub use anchor_lang::solana_program::system_program;
    pub use anchor_spl::token::{self, CloseAccount, SetAuthority, TokenAccount, Transfer};

    declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

    pub use crate::exchange::*;
    pub use crate::initialize::*;
    pub use crate::tokenizer::*;

    const DISCRIMINATOR_LEN: usize = 8;
    const BOOL_LENGTH: usize = 1;
    const PUBLIC_KEY_LEN: usize = 32;
    const U64_LEN: usize = 8;
    pub const TOKENIZER_LEN: usize = DISCRIMINATOR_LEN + BOOL_LENGTH + PUBLIC_KEY_LEN * 3 + U64_LEN;
}

use prelude::*;

#[program]
pub mod tofu_tokenizer {
    use crate::prelude::*;
    use spl_token::instruction::AuthorityType;

    const TOKENIZER_PDA_SEED: &[u8] = b"tokenizer";

    pub fn initialize(ctx: Context<Initialize>, amount: u64) -> Result<()> {
        let tokenizer_account = &mut ctx.accounts.tokenizer_account;
        tokenizer_account.is_initialized = true;
        tokenizer_account.initializer_pubkey = *ctx.accounts.initializer.to_account_info().key;
        tokenizer_account.temp_token_account_pubkey =
            *ctx.accounts.temp_token_account.to_account_info().key;
        tokenizer_account.initializer_token_to_receive_account_pubkey =
            *ctx.accounts.token_to_receive_account.to_account_info().key;
        tokenizer_account.expected_amount = amount;

        let (pda, _bump_seed) = Pubkey::find_program_address(&[TOKENIZER_PDA_SEED], ctx.program_id);
        token::set_authority(ctx.accounts.into(), AuthorityType::AccountOwner, Some(pda))?;
        Ok(())
    }

    pub fn exchange(ctx: Context<Exchange>, amount_expected_by_taker: u64) -> Result<()> {
        let tokenizer_account = &ctx.accounts.tokenizer_account;

        if amount_expected_by_taker != ctx.accounts.pdas_temp_token_account.amount {
            return Err(ExchangeError::ExpectedAmountMismatch.into());
        }

        let (_pda, bump_seed) = Pubkey::find_program_address(&[TOKENIZER_PDA_SEED], ctx.program_id);
        let seeds = &[&TOKENIZER_PDA_SEED[..], &[bump_seed]];

        token::transfer(
            ctx.accounts.into_transfer_to_initializer_context(),
            tokenizer_account.expected_amount,
        )?;

        token::transfer(
            ctx.accounts
                .into_transfer_to_taker_context()
                .with_signer(&[&seeds[..]]),
            amount_expected_by_taker,
        )?;

        token::close_account(
            ctx.accounts
                .into_close_temp_token_context()
                .with_signer(&[&seeds[..]]),
        )?;

        Ok(())
    }
}
