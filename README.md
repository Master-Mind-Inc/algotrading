# Title
Web API Server for dialing with BINANCE Market

## ENV Example

```bash
API_PORT=10100
DEBUG=0

# DB MARKET

CH_MARKET_URL=
CH_MARKET_PORT=
CH_MARKET_PASSWORD=
CH_MARKET_USER=

# DB LOGS

CH_LOGS_URL=
CH_LOGS_PORT=
CH_LOGS_PASSWORD=
CH_LOGS_USER=

ORACLE_NAME=2016_4
PIPE=2016
MODEL=4
STRAT_ID=2
BASE=BTC
BASE_SATOSHI=100000000

BASE_MIN_COIN=0.0002
QUOTE_MIN_SUM=10.0
QUOTE=USDT
BNB_PRICE=15.0
EXCHANGE=BINANCE_EMULATOR
COMMISSION=0.001
SLIPPING=0.05

MARKET_DELAY=1600
MARKET_PENALTY=0.01
EXPERIMENT_NAME=test

SLACK_WEBHOOK_URL=
TELEGRAM_TOCKEN=
TELEGRAM_CHAT_ID=

INVERSE=0
ACCURACY_LEVEL=0.5
ACCURACY_FILTER=0
ACCURACY_FIELD=accuracy

REG_REV_EXPIRED_TIME=57600

# COLOR API
COLOR_TIME_RANGE=604800
COLOR_URL=
COLOR_TP_MIN=0.015
COLOR_SL_MIN=0.02
COLOR_SL_MAX=0.15
DYNAMIC_SLTP=0

# ACCOUNT API
ACCOUNT_URL=
ACCOUNT_NAME=account_11

INTERNAL_RISK_MANAGER=1
RECALCULATE_HISTORY=1
BATCH_TS_START=1574689898000
BATCH_SIZE=14400
WALLET=10817

MAX_P9=9


# BITFINEX URL & CREDENTIALS
# REST_URL        =https://api-pub.bitfinex.com
# REST_AUTH_URL   =https://api.bitfinex.com

# BINANCE URL & CREDENTIALS
REST_AUTH_URL   =https://api.binance.com

# Andrei
API_KEY         =BLABLA
API_SEC         =BLABLA
```

## START MODE:


## 1. executor_prod

It is run with **EX**ternal Risk Manager from **now()** on **REAL** Exchange

```
EXCHANGE=BINANCE
EXPERIMENT_NAME='actual_1'
ACCOUNT_NAME='account_exec_1' (specific Account Name)
SLACK_WEBHOOK_URL= ... (should be slack channel for specific Account Name)
INTERNAL_RISK_MANAGER=0
RECALCULATE_HISTORY=0
```

## 2. executor_analytics

It is run with **EX**ternal Risk Manager from **now()** on **Emulated** Exchange
It should **complitely duplicate a real account** with the same Oracles as in the **1st mode**

```
EXCHANGE=BINANCE_EMULATOR
EXPERIMENT_NAME='actual_1' (the same with executor_prod)
ACCOUNT_NAME='account_emul_1' (specific Account Name. Should be DIFFERENT with PROD !!!!!!! )
SLACK_WEBHOOK_URL= ... (should be slack channel for specific Account Name)
INTERNAL_RISK_MANAGER=0
RECALCULATE_HISTORY=0
----
WALLET=10817
MARKET_DELAY=1600
MARKET_PENALTY=0.01
```

## 3. executor_TQ_check

It is run with **IN**ternal Risk Manager from **history** up to **now** on **Emulated** Exchange
It is a single Oracle.

```
EXCHANGE=BINANCE_EMULATOR
EXPERIMENT_NAME='actual_#'
ACCOUNT_NAME='account_exec_1' (specific Account Name)
    SLACK_WEBHOOK_URL= ... (should be EMPTY !!!!!!!!!  or does not exist !!!!!!)
INTERNAL_RISK_MANAGER=1
RECALCULATE_HISTORY=1
---- 
WALLET=10817
MARKET_DELAY=1600
MARKET_PENALTY=0.01
----
BATCH_TS_START=1574689898000
BATCH_SIZE=14400

```

## 3a. executor_TQ_check after Stop

```
The same with 3
RECALCULATE_HISTORY=0
```

## 4. executor_PnL

```
EXCHANGE=BINANCE_PNL
RECALCULATE_HISTORY=0
INTERNAL_RISK_MANAGER=1
MAX_P9=9
BATCH_TS_START=1564672380000
BATCH_TS_END=1572600000000
```
