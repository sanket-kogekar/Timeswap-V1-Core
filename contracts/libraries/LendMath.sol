// SPDX-License-Identifier: MIT
pragma solidity =0.8.1;

import {IPair} from '../interfaces/IPair.sol';
import {FullMath} from './FullMath.sol';
import {ConstantProduct} from './ConstantProduct.sol';
import {SafeCast} from './SafeCast.sol';
import 'hardhat/console.sol';

library LendMath {
    using FullMath for uint256;
    using ConstantProduct for IPair.State;
    using SafeCast for uint256;

    //TODO: change fx to pure
    function check(
        IPair.State memory state,
        uint112 xIncrease,
        uint112 yDecrease,
        uint112 zDecrease,
        uint16 fee
    ) internal view {
        uint128 feeBase = 0x10000 + fee;
        
        uint112 xReserve = state.x + xIncrease;
        
        uint128 yAdjusted = adjust(state.y, yDecrease, feeBase);
        
        uint128 zAdjusted = adjust(state.z, zDecrease, feeBase);
        
        state.checkConstantProduct(xReserve, yAdjusted, zAdjusted);
        
        uint256 minimum = xIncrease;
        minimum *= state.y;
        minimum <<= 12;
        uint256 denominator = xReserve;
        denominator *= feeBase;
        minimum /= denominator;
        
        require(yDecrease >= minimum, 'Minimum');
        
    }

    //TODO: change function to pure
    function adjust(
        uint112 reserve,
        uint112 decrease,
        uint128 feeBase
    ) private view returns (uint128 adjusted) {
        uint256 _adjusted = reserve;
        
        _adjusted <<= 16;
        
        uint256 _adjustedDecrease = uint256(feeBase) * decrease;
        _adjusted -= _adjustedDecrease;
        
        adjusted = _adjusted.toUint128();
        
        
    }

    function getBond(
        uint256 maturity,
        uint112 xIncrease,
        uint112 yDecrease
    ) internal view returns (uint128 bondOut) {
        uint256 _bondOut = maturity;
        _bondOut -= block.timestamp;
        _bondOut *= yDecrease;
        _bondOut >>= 32;
        _bondOut += xIncrease;
        bondOut = _bondOut.toUint128();
    }

    function getInsurance(
        uint256 maturity,
        IPair.State memory state,
        uint112 xIncrease,
        uint112 zDecrease
    ) internal view returns (uint128 insuranceOut) {
        uint256 _insuranceOut = maturity;
        
        _insuranceOut -= block.timestamp;
        
        _insuranceOut *= state.y;
        
        _insuranceOut += uint256(state.x) << 32;
        
        uint256 denominator = state.x;
        
        denominator += xIncrease;
        
        denominator *= uint256(state.x);
        
        denominator <<= 32;
        
        
        
        _insuranceOut = _insuranceOut.mulDiv(uint256(xIncrease) * state.z, denominator);
        
        _insuranceOut += zDecrease;
        
        insuranceOut = _insuranceOut.toUint128();
        
    }
}
