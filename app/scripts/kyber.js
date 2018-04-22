const mainKyberNetworkABI = require('./kyberConfig/KyberNetworkABI.json');
const KyberReserveABI = require('./kyberConfig/KyberReserveABI.json');
//todo convert from callbacks to async (or promise)
const kyberFuncs = function () {
    var _this = this;
    this.kyberNetworkABI = {};
    for (let i in mainKyberNetworkABI) this.kyberNetworkABI[mainKyberNetworkABI[i].name] = mainKyberNetworkABI[i];
    this.kyberReserveABI = {};
    for (let i in KyberReserveABI) this.kyberReserveABI[KyberReserveABI[i].name] = KyberReserveABI[i];
    this.tokenABIs = {};
    switch (ajaxReq.type) {
        case nodes.nodeTypes.ETH:
            this.nodeType = "ETH";
            _this.setCurrentNetwork(kyberFuncs.networks.ETH);

            for (let key in kyberFuncs.networkTokenABIs.ETH) {
                this.tokenABIs[key] = {};
                for (let i in kyberFuncs.networkTokenABIs.ETH[key]) {
                    this.tokenABIs[key][kyberFuncs.networkTokenABIs.ETH[key][i].name] = kyberFuncs.networkTokenABIs.ETH[key][i];
                }
            }
            ;
            break;
        case nodes.nodeTypes.Ropsten:
            this.nodeType = "ROPSTEN";
            _this.setCurrentNetwork(kyberFuncs.networks.ROPSTEN);

            for (let key in kyberFuncs.networkTokenABIs.ROPSTEN) {
                this.tokenABIs[key] = {};
                for (let i in kyberFuncs.networkTokenABIs.ROPSTEN[key]) {
                    this.tokenABIs[key][kyberFuncs.networkTokenABIs.ROPSTEN[key][i].name] = kyberFuncs.networkTokenABIs.ROPSTEN[key][i];
                }
            }
            break;
        default:
            _this.setCurrentNetwork(kyberFuncs.networks.NULL);
            this.tokenABIs = {};
    }
};
kyberFuncs.defaultValues = {
    gasLimit: 300000,
    gasPrice: 2000000000, // 2 Gwei
    maxGasPrice: 30000000000 // 30 Gwei
};
kyberFuncs.priceLoaded = false;
kyberFuncs.currRates = {};
// kyberFuncs.maxGasPrice = 50000000000; // 50 Gwei
kyberFuncs.ETH_TOKEN_ADDRESS = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"; //todo: this is redundant (look to remove)
kyberFuncs.mainTokens = [];
kyberFuncs.networks = {
    ETH: require('./kyberConfig/EthConfig.json'),
    ROPSTEN: require('./kyberConfig/RopConfig.json'),
    NULL: require('./kyberConfig/NullConfig.json'),
};
kyberFuncs.networkTokenABIs = {
    ETH: require("./kyberConfig/EthTokenABIs.json"),
    ROPSTEN: require('./kyberConfig/RopTokenABIs.json'),
    NULL: {}
};

kyberFuncs.kyberUnavailablePhrasing = function (fromCoin, toCoin) {
    let _pair = kyberFuncs.toPairKey(fromCoin, toCoin);
    return `The pair ${_pair} is currently unavailable`;
};

kyberFuncs.prototype.buildPairList = function (tokens) {
    let forRates = {};
    tokens.forEach((_token) => {
        tokens.forEach((_token2) => {
            if (_token !== _token2) {
                forRates[_token + "/" + _token2] = 0
            }
        });
    });
    return forRates;
};

kyberFuncs.toPairKey = function (_from, _to) {
    return _from + "/" + _to;
};

kyberFuncs.fromPairKey = function (_pairKey) {
    return _pairKey.split("/");
};

kyberFuncs.BnToNumber = function (bn) {
    return bn.toNumber();
}

kyberFuncs.prototype.setCurrentNetwork = function (_network) {
    var _this = this;
    if (_network) {

        _this.currentNetwork = _network;
        _this.tokenDetails = _network.tokens;
        _this.mainTokens = Object.keys(_network.tokens);
        _this.kyberRates = this.buildPairList(_this.mainTokens);
        _this.KyberNetworkAddress = _network.network; // replace with resolution using ENS for mainnet
    }
};

kyberFuncs.prototype.setDefaultValues = function (_network) {
    var _this = this;
    // kyberFuncs.defaultValues.maxGasPrice = _network["max gas price"] ? _network["max gas price"] : 50000000000;// 50 Gwei
}

kyberFuncs.prototype.setCurrentTokenABIs = function (_tokenABIs) {
    var _this = this;
    _this.tokenABIs = _tokenABIs;
};

kyberFuncs.prototype.getKyberNetworkAddress = function () {
    var _this = this;
    return _this.currentNetwork.network;
};

kyberFuncs.prototype.getTokenAddress = function (_token) {
    var _this = this;
    return _this.tokenDetails[_token].address;
};

kyberFuncs.prototype.getTokenList = function () {
    var _this = this;
    return _this.mainTokens.filter(_tok => _tok !== "ETH")
};

kyberFuncs.prototype.getDataString = function (func, inputs, callback) {
    var fullFuncName = ethUtil.solidityUtils.transformToFullName(func);
    var funcSig = ethFuncs.getFunctionSignature(fullFuncName);
    var typeName = ethUtil.solidityUtils.extractTypeName(fullFuncName);
    var types = typeName.split(',');
    types = types[0] == "" ? [] : types;
    return '0x' + funcSig + ethUtil.solidityCoder.encodeParams(types, inputs);
};

kyberFuncs.prototype.findBestRate = function (srcToken, destToken, srcQty, callback) {
    /*returns (uint expectedRate, uint slippageRate)*/
    var _this = this;
    var srcTokenAddress = _this.getTokenAddress(srcToken);
    var destTokenAddress = _this.getTokenAddress(destToken);
    var funcABI = _this.kyberNetworkABI.findBestRate;
    ajaxReq.getEthCall({
        to: _this.currentNetwork.network,
        data: _this.getDataString(funcABI, [srcTokenAddress, destTokenAddress, srcQty])
    }, function (data) {
        if (data.error) callback(data);
        else {
            var outTypes = funcABI.outputs.map(function (i) {
                return i.type;
            });

            data.data = {
                "bestReserve": ethUtil.solidityCoder.decodeParams(outTypes, data.data.replace('0x', ''))[0].toNumber(),
                "bestRate": ethUtil.solidityCoder.decodeParams(outTypes, data.data.replace('0x', ''))[1].toNumber()
            };
            callback(data);
        }
    });
};

kyberFuncs.prototype.ethCall = function (funcABI, inputArray) {
    var _this = this;
    ajaxReq.getEthCall({
        to: _this.currentNetwork.network,
        data: _this.getDataString(funcABI, inputArray)
    }, function (data) {
        if (data.error) callback(data);
        else {
            var outTypes = funcABI.outputs.map(function (i) {
                return i.type;
            });
            data.data = ethUtil.solidityCoder.decodeParams(outTypes, data.data.replace('0x', ''))[0];
            callback(data);
        }
    });
};


kyberFuncs.prototype.refreshRates = function () {
    var _this = this;

    let keys = Object.keys(_this.kyberRates);
    keys.forEach(function (_key) {
        let pairContents = kyberFuncs.fromPairKey(_key);
        let fromToken = pairContents[0];
        let toToken = pairContents[1];
        _this.getExpectedRate(fromToken, toToken, 1, (_results) => {
            //
            _this.kyberRates[_key] = _this.convertToTokenBase(_results.data.slippageRate, "ETH");
        })
    });
    _this.priceLoaded = true;
};

// For tokens with less than 18 decimals convert the raw balance to use 18 decimals for comparison (i.e. the values are converted to eth like decimals) [temporary]
// Todo: convert all conversion points to use convertToTokenWei or convertToTokenBase
kyberFuncs.prototype.convertToEighteenDecimal = function (_token, _value) {
    var _this = this;
    let decimal = _this.tokenDetails[_token].decimals;
    if (decimal < 18) {
        return new BigNumber(_value).times(new BigNumber(10).pow(18 - decimal)).toString();
    } else {
        return _value;
    }
};

kyberFuncs.prototype.convertToTokenWei = function (_value, _token) {
    var _this = this;
    // console.log("convertToTokenWei _value, _token", _value, _token); //todo remove dev item
    if (_value == "" || _value == undefined) {
        _value = 0;
    }
    let decimal = _this.tokenDetails[_token].decimals;
    if (decimal < 18) {
        return new BigNumber(String(_value)).times(new BigNumber(10).pow(decimal)).toString();
    } else {
        return etherUnits.toWei(_value, "ether");
    }

};

kyberFuncs.prototype.convertToTokenBase = function (_value, _token) {
    var _this = this;
    // console.log("convertToTokenBase _value, _token", _value, _token); //todo remove dev item
    // if(_value != ""){
    let decimal = _this.tokenDetails[_token].decimals;
    if (decimal < 18) {
        let numnum = new BigNumber(String(_value)).div(new BigNumber(10).pow(decimal)).toNumber();

        return numnum;
    } else {
        return etherUnits.toEther(_value, "wei");
    }
    // }

};

kyberFuncs.prototype.getRate = async function (srcToken, destToken, srcQty, callback) {
    var _this = this;
    ajaxReq.getCurrentBlock((blockData) => {
        let currentBlockNumber = blockData.data;
        var funcABI = _this.kyberReserveABI.getConversionRate;
        var srcTokenAddress = _this.getTokenAddress(srcToken);
        var destTokenAddress = _this.getTokenAddress(destToken);
        ajaxReq.getEthCall({
            to: _this.currentNetwork.reserve,
            data: _this.getDataString(funcABI, [srcTokenAddress, destTokenAddress, srcQty, currentBlockNumber])
        }, function (data) {
            if (data.error) callback(data);
            else {
                var outTypes = funcABI.outputs.map(function (i) {
                    return i.type;
                });
                data.data = ethUtil.solidityCoder.decodeParams(outTypes, data.data.replace('0x', ''))[0];
                callback(data);
            }
        });
    });

    //getConversionRate
    // return rate, expBlock, balance
};


kyberFuncs.prototype.getBalance = async function (_token, userAddress, callback) {
    var _this = this;
    // returns int
    var _tokenAddress = _this.getTokenAddress(_token);
    var funcABI = _this.kyberNetworkABI.getBalance;
    ajaxReq.getEthCall({
        to: _this.currentNetwork.network,
        data: _this.getDataString(funcABI, [_tokenAddress, userAddress])
    }, function (data) {
        if (data.error) callback(data);
        else {
            var outTypes = funcABI.outputs.map(function (i) {
                return i.type;
            });
            data.data = ethUtil.solidityCoder.decodeParams(outTypes, data.data.replace('0x', ''))[0].toNumber();
            callback(data);
        }
    });
};


kyberFuncs.prototype.getGas = function () {
    let reqObj = {"id": ajaxReq.getRandomID(), "jsonrpc": "2.0", "method": "eth_gasPrice", "params": []};
    ajaxReq.rawPost(reqObj, function (data) {
        let asNum = ethFuncs.hexToDecimal(data.result);

        // for (var i in data) {
        //     if (data[i].error) {
        //         callback({error: true, msg: data[i].error.message, data: ''});
        //         return;
        //     }
        // }
    })
}

/*ERC20 src, ERC20 dest, uint srcQty*/
// rate/10**18between 1 eth and 1 token base
kyberFuncs.prototype.getExpectedRate = function (srcToken, destToken, srcQty /* In ETH or Whole Token*/, callback) {
    var _this = this;
    // returns int
    var srcTokenAddress = _this.getTokenAddress(srcToken);
    var destTokenAddress = _this.getTokenAddress(destToken);
    var valueInWei = _this.convertToTokenWei(srcQty, srcToken);
    var funcABI = this.kyberNetworkABI.getExpectedRate;
    ajaxReq.getEthCall({
        to: _this.currentNetwork.network,
        data: _this.getDataString(funcABI, [srcTokenAddress, destTokenAddress, valueInWei])
    }, function (data) {
        if (data.error) callback(data);
        else {
            var outTypes = funcABI.outputs.map(function (i) {
                return i.type;
            });

            data.data = {
                "expectedRate": ethUtil.solidityCoder.decodeParams(outTypes, data.data.replace('0x', ''))[0].toNumber(),
                "slippageRate": ethUtil.solidityCoder.decodeParams(outTypes, data.data.replace('0x', ''))[1].toNumber()
            };
            callback(data);
        }
    });
};


kyberFuncs.prototype.getUserCapInWei = function (address, callback) {
    var _this = this;
    // returns int
    var funcABI = _this.kyberNetworkABI.getUserCapInWei;
    ajaxReq.getEthCall({
        to: _this.currentNetwork.network,
        data: _this.getDataString(funcABI, [address])
    }, function (data) {
        if (data.error) callback(data);
        else {
            var outTypes = funcABI.outputs.map(function (i) {
                return i.type;
            });

            data.data = ethUtil.solidityCoder.decodeParams(outTypes, data.data.replace('0x', ''))[0];
            callback(data);
        }
    });
};

kyberFuncs.prototype.checkUserCap = function (_userAddress, swapValue /* In ETH (base value)*/, isFrom, callback) {
    var _this = this;
    let weiValue = _this.convertToTokenWei(swapValue, "ETH");

    _this.getUserCapInWei(_userAddress, function (data) {

        let numberAsBN = new BigNumber(weiValue);
        let nineFivePct = data.data.times(0.95);
        let nineFivePctUserCap = etherUnits.toEther(nineFivePct, "wei");
        if (nineFivePct.gt(numberAsBN)) {
            callback(
                {
                    error: false,
                    data: {
                        isFrom: isFrom,
                        userCap: nineFivePctUserCap,
                        originalValue: swapValue,
                        result: nineFivePct.gt(numberAsBN)
                    }
                });
        } else {
            callback(
                {
                    error: true,
                    data: {
                        isFrom: isFrom,
                        userCap: nineFivePctUserCap,
                        originalValue: swapValue,
                        result: nineFivePct.gt(numberAsBN)
                    }
                });
        }
    })
};

kyberFuncs.prototype.kyberNetworkState = async function (callback) {
    var _this = this;
    var funcABI = _this.kyberNetworkABI.enabled;
    ajaxReq.getEthCall({
        to: _this.currentNetwork.network,
        data: _this.getDataString(funcABI, [""])
    }, function (data) {
        if (data.error) callback(data);
        else {
            var outTypes = funcABI.outputs.map(function (i) {
                return i.type;
            });
            data.data = ethUtil.solidityCoder.decodeParams(outTypes, data.data.replace('0x', ''))[0];

            callback(data);
        }
    });
};


// 100000000000000000 wei -> .1 Eth
/*kyberFuncs.prototype.trade = function (srcToken, srcAmount, destToken, destAddress, callback) {
    var _this = this;
    var funcABI = _this.kyberNetworkABI.trade;
    var srcTokenAddress = _this.getTokenAddress(srcToken);
    var destTokenAddress = _this.getTokenAddress(destToken);
    let walletId = 0; // This could change, but is not a user input value (as far as I can tell)
    let minConversionRate = 1; // 1-> Market Rate, but we could also set this as the quoted rate
    let maxDestAmount = 2 ** 200; //100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000; // Really big number (like a googol)
    ajaxReq.getEthCall({
        to: _this.currentNetwork.network,
        data: _this.getDataString(funcABI, [srcTokenAddress, srcAmount, destTokenAddress, destAddress, maxDestAmount, minConversionRate, walletId])
    }, function (data) {
        if (data.error) callback(data);
        else {
            var outTypes = funcABI.outputs.map(function (i) {
                return i.type;
            });
            data.data = ethUtil.solidityCoder.decodeParams(outTypes, data.data.replace('0x', ''))[0];
            callback(data);
        }
    });
};*/

kyberFuncs.prototype.approveKyber = function (srcToken, value) {
    var _this = this;
    var funcABI = _this.tokenABIs[srcToken].approve;
    var srcTokenAddress = _this.getTokenAddress(srcToken);
    // var weiValue = etherUnits.toWei(value, "ether");
    var weiValue = _this.convertToTokenWei(value, srcToken);

    return _this.getDataString(funcABI, [_this.KyberNetworkAddress, weiValue]);
};

kyberFuncs.prototype.allowance = function (srcToken, userAddress, callback) {
    var _this = this;
    var funcABI = _this.tokenABIs[srcToken].allowance;

    var srcTokenAddress = _this.getTokenAddress(srcToken);

    ajaxReq.getEthCall({
        to: srcTokenAddress,
        data: _this.getDataString(funcABI, [userAddress, _this.KyberNetworkAddress])
    }, function (data) {
        if (data.error) callback(data);
        else {
            var outTypes = funcABI.outputs.map(function (i) {
                return i.type;
            });

            data.data = ethUtil.solidityCoder.decodeParams(outTypes, data.data.replace('0x', ''))[0].toNumber();

            callback(data);
        }
    });
};

kyberFuncs.prototype.getTradeData = function (swapOrder, minRate) {
    var _this = this;

    var funcABI = _this.kyberNetworkABI.trade;
    var srcTokenAddress = _this.getTokenAddress(swapOrder.fromCoin);
    var destTokenAddress = _this.getTokenAddress(swapOrder.toCoin);
    // let walletId = 0; // This could change, but is not a user input value (as far as I can tell)
    let walletId = "0xDECAF9CD2367cdbb726E904cD6397eDFcAe6068D";
    let minConversionRate = minRate ? minRate : 1; // Uses slippagePrice with fallback to MarketRate.  1 => Market Rate, but we could also set this as the quoted rate
    let srcAmount = _this.convertToTokenWei(swapOrder.fromVal, swapOrder.fromCoin);//etherUnits.toWei(swapOrder.fromVal, "ether");
    let maxDestAmount = 2 ** 200; //100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000; // Really big number (like a googol)

    if (swapOrder.toAddress) {
        return _this.getDataString(funcABI, [srcTokenAddress, srcAmount, destTokenAddress, swapOrder.toAddress, maxDestAmount, minConversionRate, walletId])
    } else {
        uiFuncs.notifier.danger(" No Deposit address specified");
    }
};

module.exports = kyberFuncs;