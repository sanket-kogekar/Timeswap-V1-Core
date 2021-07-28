// SPDX-License-Identifier: MIT
pragma solidity =0.8.1;

import {IPair} from '../interfaces/IPair.sol';

library ConstantProduct {
    function check(
        IPair.Parameter memory newParameter,
        IPair.Parameter memory parameter
    ) internal pure {
        (uint256 newProd0, uint256 newProd1) = mul512(
            uint256(newParameter.reserves.asset),
            uint256(newParameter.interest) * uint256(newParameter.cdp)
        );
        (uint256 prod0, uint256 prod1) = mul512(
            uint256(parameter.reserves.asset),
            uint256(parameter.interest) * uint256(parameter.cdp)
        );

        require(newProd1 >= prod1, 'ConstantProduct :: check : invariance');
        if (newProd1 == prod1) require(newProd0 >= prod0, 'ConstantProduct :: check : invariance');
    }

    function mul512(uint256 a, uint256 b) private pure returns (uint256 prod0, uint256 prod1) {
        // 512-bit multiply [prod1 prod0] = a * b
        // Compute the product mod 2**256 and mod 2**256 - 1
        // then use the Chinese Remainder Theorem to reconstruct
        // the 512 bit result. The result is stored in two 256
        // variables such that product = prod1 * 2**256 + prod0
        assembly {
            let mm := mulmod(a, b, not(0))
            prod0 := mul(a, b)
            prod1 := sub(sub(mm, prod0), lt(mm, prod0))
        }
    }
}