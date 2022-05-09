use crate::prelude::*;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub initializer: Signer<'info>,
    #[account(mut)]
    pub temp_token_account: Account<'info, TokenAccount>,
    #[account(constraint = *token_to_receive_account.to_account_info().owner == spl_token::id() @ ProgramError::IncorrectProgramId)]
    pub token_to_receive_account: Account<'info, TokenAccount>,
    #[account(init, payer = initializer, space = TOKENIZER_LEN,
    constraint = !tokenizer_account.is_initialized @ ProgramError::AccountAlreadyInitialized
  )]
    pub tokenizer_account: Account<'info, Tokenizer>,
    /// CHECK: Only read
    #[account(address = spl_token::id())]
    pub token_program: AccountInfo<'info>,
    /// CHECK: Only read
    #[account(address = system_program::ID)]
    pub system_program: AccountInfo<'info>,
}

impl<'info> From<&mut Initialize<'info>> for CpiContext<'_, '_, '_, 'info, SetAuthority<'info>> {
    fn from(accounts: &mut Initialize<'info>) -> Self {
        let cpi_accounts = SetAuthority {
            current_authority: accounts.initializer.to_account_info().clone(),
            account_or_mint: accounts.temp_token_account.to_account_info().clone(),
        };

        let cpi_program = accounts.token_program.to_account_info();
        CpiContext::new(cpi_program, cpi_accounts)
    }
}
