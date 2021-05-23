
module.exports = {
    factory: 
    [
        'event PairCreated(address indexed token0, address indexed token1, address pair, uint)'
    ], 
    router:   
    [
        'function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)',
        'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)'
    ],
    locker: 
    [
        'event onDeposit(address lpToken, address user, uint256 amount, uint256 lockDate, uint256 unlockDate)'
    ], 
    myContract: 
    [
        'function check(address token) external'
    ], 
    erc20: 
    [
        'function approve(address spender, uint256 amount) external returns (bool)',
        'function balanceOf(address tokenOwner) public view returns (uint balance)',
        'function _maxTxAmount() public view returns (uint256 _maxTxAmount)', 
    ], 
    pair:
    [
        'function token0() public view returns (address token0)', 
        'function token1() public view returns (address token1)', 
    ]
}