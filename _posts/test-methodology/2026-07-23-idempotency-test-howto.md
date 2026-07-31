---
layout: post
title: '一文讲透幂等测试怎么做（附实践案例）'
subtitle: '幂等性 · 六种实现方案 · 七类用例 · 并发与失败注入 —— 一套可落地的接口幂等测试框架'
date: 2026-07-23
author: 雨落寒霜
tags: 幂等 接口测试 测试方法论 并发测试 自动化测试
---

# 一文讲透幂等测试怎么做（附实践案例）

## 引子

一个用户连点了两次“提交订单”，或者浏览器在刷新时把上一次的 POST 又发了一遍——结果数据库里多了两条订单，账户被扣了两次钱。

这类失误不稀奇，却每次都造成实打实的损失。它抛出的问题很朴素：**同一个操作被重复执行，系统产生的副作用——也就是多建的单、多扣的钱这类实际状态变化——会不会因此变多。** 幂等测试要验证的，就是这件事。

---

## 一、什么是接口幂等性

幂等（idempotency）原本是数学概念：一个操作 `f` 满足 `f(f(x)) = f(x)`，即套用任意多次与套用一次效果相同。落到 HTTP 接口上，[RFC 7231](https://datatracker.ietf.org/doc/html/rfc7231) §4.2.2（后被 [RFC 9110](https://datatracker.ietf.org/doc/html/rfc9110) 继承）给出的定义是：用同一方法发起多个相同请求，对服务端造成的“预期影响”与单个请求相同。

换成接口测试的口径：同一个请求发 1 次、发 10 次，系统做的事、留下的状态，应该和发 1 次完全一样——**钱不多扣、单不多建、消息不多发**。

HTTP 方法按幂等性划分如下（这是协议层属性）：

| 方法                           |  安全 |  幂等 | 说明            |
| ---------------------------- | :-: | :-: | ------------- |
| GET / HEAD / OPTIONS / TRACE |  是  |  是  | 只读，可无限重试      |
| PUT                          |  否  |  是  | 全量替换，末次写获胜    |
| DELETE                       |  否  |  是  | 删一次和删十次，资源都不在 |
| POST                         |  否  |  否  | 默认每次创建新资源     |
| PATCH                        |  否  | 视实现 | 设计得当可幂等       |

两个认知坑需要提前排掉：

**坑一：幂等看“状态”不看“响应”。** DELETE 第一次返回 200（删除成功），第二次返回 404（东西已不在），响应码不同，但资源确实只被删了一次，它仍是幂等的。测试断言要落在数据库记录数、账户余额这类**状态 / 副作用**上，而不是死磕返回码。

**坑二：幂等 ≠ 安全（Safe）。** 安全指只读无副作用；幂等指可以有副作用，但重复不会产生额外副作用。所有安全方法都幂等，但 PUT / DELETE 有副作用却幂等——反过来不成立。

结论很直接：幂等性是对“操作”本身的要求。单机系统里表单重复提交、用户连点提交，都是不折不扣的幂等问题。

---

## 二、为什么要做幂等测试

重复请求从哪来？至少分两类来源，第一类跟架构无关：

- **前端 / 单机类**：浏览器刷新重发 POST、用户连点提交按钮、移动端弱网下客户端自动重试。这些在任何系统里都存在。
- **架构类**：网关 / 负载均衡重试、消息队列重投（Kafka / RocketMQ / SQS 默认 at-least-once，消息保证送到但可能送多次）、上游 Webhook 重投（支付平台保证“至少送达一次”）。

幂等一旦缺失，客户端的超时重试、网关重投、Webhook 重发会直接变成重复扣款、重复建单——在支付、订阅等场景里尤其常见。

权威规范已经把幂等要求写进了 API 契约：

- **[RFC 7231](https://datatracker.ietf.org/doc/html/rfc7231) / [RFC 9110](https://datatracker.ietf.org/doc/html/rfc9110)**：形式化定义了幂等方法。
- **[Microsoft Azure REST API Guidelines](https://github.com/microsoft/api-guidelines/blob/vNext/azure/Guidelines.md)**：明确要求 *“all service operations (including POST) must be idempotent”*，并给出 `Repeatability-Request-ID` + `Repeatability-First-Sent` 的实现规范。
- **[Stripe 官方文档](https://docs.stripe.com/api/idempotent_requests)**：要求所有 POST 携带 `Idempotency-Key`；同键重放返回首次结果；同键不同参数返回 400；同键正在处理返回 409。

幂等已经不是“加分项”，而是接口契约的一部分。幂等测试，就是验证这份契约是否真的成立。

---

## 三、被测对象：六种幂等实现方案

开发实现幂等有成熟套路。测试人员不必会写，但要认得每一种、知道该测哪里。

| 方案                  | 适用场景         | 原理                                 | 测试风险点                       |
| ------------------- | ------------ | ---------------------------------- | --------------------------- |
| 数据库唯一约束 / 去重表       | 订单号、交易号等强唯一  | 唯一索引让重复插入失败                        | 异常是否被正确处理；分库分表下唯一键是否只在分片内有效 |
| 幂等键 Idempotency-Key | 所有对外 POST    | 客户端生成唯一键，服务端缓存结果                   | 原子性、并发竞态、参数一致性、TTL、副作用守卫    |
| Token 令牌            | 防表单 / 按钮重复提交 | 先领令牌，提交时校验并原子删除                    | 校验+删除必须原子，否则竞态              |
| 乐观锁 / 版本号           | 带版本的更新       | `WHERE version = ?` 失败即被他人改过       | 0 行更新后的重试 / 报错路径            |
| 状态机                 | 订单 / 工单流程    | 只允许合法状态流转                          | 非法流转被拒；重复流转幂等               |
| 分布式锁 + 去重           | 高并发竞争资源      | 锁保证单飞，去重表兜底                        | 锁释放时机、死锁、锁服务不可用降级           |
| 天然幂等 UPSERT         | 可用自然键标识的操作   | `INSERT ... ON CONFLICT DO UPDATE` | 实现是否真 upsert 而非 insert      |

测试前先问开发“这个接口用哪种方案”，再按对应风险点设计用例，比盲目点接口有效得多。

---

## 四、测试框架：七类用例 T1–T7

把“重复”这件事拆成七种可被验证的情形，覆盖主要故障模式：

| 编号        | 用例                  | 操作                   | 断言（Pass 条件）              |
| --------- | ------------------- | -------------------- | ------------------------ |
| T1 确定性重复  | 同幂等键连发两次相同请求        | 第1次成功，立即第2次同键同参      | 第2次返回缓存结果；**副作用只发生 1 次** |
| T2 并发竞争   | N 个完全相同请求同时到达       | 多线程 / 压测工具同时发        | 恰好 1 次执行；记录数 = 1；无重复扣款   |
| T3 失败注入   | 业务成功但响应回写前进程被杀      | 提交后、返回前 kill，重启后同键重试 | 不重复执行；最终状态一致             |
| T4 参数不一致  | 同键、不同参数重试           | 第1次成功，第2次改金额         | 返回 400，拒绝用同键覆盖不同逻辑       |
| T5 键过期    | 超过 TTL 后同键重试        | 等过期（或调小 TTL）后重试      | 视为新请求，正常处理               |
| T6 副作用守卫  | 幂等操作含发邮件 / 调外部 API  | 同键重复触发               | 副作用只触发 1 次               |
| T7 天然幂等校验 | 对 PUT / DELETE 重复调用 | 重复 PUT / DELETE      | 最终状态一致                   |

**T2 并发竞争与 T3 失败注入是两个最常见的盲区。** 它们的 bug 只在并发或崩溃时出现，普通的“连发两次”永远抓不到——而这只能靠集成测试的并发与失败注入来覆盖。下面这张矩阵帮你在“方案 × 用例”之间不遗漏：

```
                 T1  T2  T3  T4  T5  T6  T7
POST+幂等键        ✅  ✅  ✅  ✅  ✅  ✅  —
POST+唯一约束      ✅  ✅  ✅  —  —  —   —
Token 令牌         ✅  ✅  —  —  ✅  —   —
乐观锁 / 版本号    ✅  ✅  ✅  —  —  —   —
状态机             ✅  ✅  ✅  —  —  —   —
MQ 消费去重        ✅  ✅  ✅  —  ✅  ✅  —
PUT/DELETE 天然    —  —  —  —  —  —   ✅
```

贯穿所有用例的核心断言只有一句：**副作用发生次数 == 1**。去数数据库记录、看余额前后差、查消息发了几条出去，而不是只看接口返回“成功”。

---

## 五、实践案例（Python）

以下代码配套的可运行工程 [`idempotency-test-demo`](https://github.com/rawqing/idempotency-test-demo) ，可直接对照运行。

### 5.1 支付下单

正确实现的关键是让“认领幂等键 → 执行业务 → 标记完成”三步保持原子性。下面的写法用一把锁把“认领”包住，确保两个同键请求不会同时通过“未处理”的检查：

```python
import threading

class ConflictError(Exception):
    pass

class PaymentService:
    def __init__(self):
        self._lock = threading.Lock()
        self.idem_store = {}   # idem_key -> {"status": "PENDING" / "COMPLETED"}
        self.payments = []     # 真实副作用：扣款记录

    def pay(self, idem_key, order_no, amount):
        with self._lock:
            rec = self.idem_store.get(idem_key)
            if rec and rec["status"] == "COMPLETED":
                return {"replayed": True}        # 重放缓存结果
            if rec and rec["status"] == "PENDING":
                raise ConflictError(idem_key)    # 正在处理，稍后重试
            self.idem_store[idem_key] = {"status": "PENDING"}
        result = self._charge(order_no, amount)  # 副作用：扣款
        with self._lock:
            self.idem_store[idem_key] = {"status": "COMPLETED"}
        return result

    def _charge(self, order_no, amount):
        self.payments.append({"order_no": order_no, "amount": amount})
```

反模式是 `check-then-act`（先查后写）且不加锁：

```python
def pay_buggy(self, idem_key, order_no, amount):
    if self.idem_store.get(idem_key, {}).get("status") == "COMPLETED":
        return {"replayed": True}
    # 两个同键请求可同时查到"未处理"，然后都去扣款
    result = self._charge(order_no, amount)
    self.idem_store[idem_key] = {"status": "COMPLETED"}
    return result
```

两个同键请求若同时越过 `if` 检查，就会各自扣一次款——这就是 T2 并发用例要抓的双扣根因。

**测试点**：T1 同键连发两次 → `payments` 仅 1 条；T2 用 20 个线程同键并发 → 正确实现 `payments` 仍为 1，反模式会到 20；T3 首次扣款成功后“响应丢失”再重试 → 仍只扣 1 次。

### 5.2 Webhook 回调

Webhook 是重复扣费的高发区。正确做法是用事件 ID 做原子去重，重复事件直接 ack，不重复执行业务：

```python
import redis
r = redis.Redis()

def handle_webhook(event):
    event_id = event["id"]
    # SETNX：事件已处理过则直接返回，不重复开通权益 / 发邮件
    if not r.set(f"webhook:{event_id}", "1", ex=86400, nx=True):
        return {"received": True}
    provision_access(event["user_id"])   # 开通权益（副作用）
    send_confirmation(event["email"])     # 发邮件（副作用）
    return {"received": True}
```

反模式是每次重试都直接落库 + 开通 + 发邮件，删掉去重后，支付平台的自动重试会把同一笔事件执行多次——这正是重复扣费的根因。

**测试点**：T6 副作用守卫——同事件 ID 重发多次，`provision_access` 与 `send_confirmation` 各只调用 1 次；T3 失败注入——handler 在去重前崩溃，重启后重发不重复执行。

### 5.3 消息队列消费去重

MQ 默认 at-least-once，同一消息可能被消费两次，去重必须在消费端做：

```python
def consume(msg):
    msg_id = msg["msgId"]
    # setIfAbsent / SETNX：已处理过则跳过，保证幂等
    if not r.set(f"mq:{msg_id}", "1", ex=604800, nx=True):
        return
    process_order(msg)   # 真正处理
```

**测试点**：同 `msgId` 连发两次 → `process_order` 仅 1 次；并发消费同消息 → 仅处理 1 次。

---

## 六、能不能用工具自动化（解放人工）

结论：能，而且应该做；但不是“全自动化替代人工”，而是把能重复、高并发、要回归的部分用工具接管，把要动脑的部分留给人。

常用工具按用途分：JMeter / k6 / Locust 负责并发竞争（T2）与重复发送（T1）；pytest / RestAssured 负责写集成测试覆盖 T1–T7 并查库断言副作用；Toxiproxy / Chaos Mesh 负责模拟网络断开与进程崩溃，做失败注入（T3）；WireMock / Mountebank 负责模拟支付平台重发 Webhook，测 T3 / T6。

**利**：可重复、可回归，接进 CI 每次提交自动跑；高并发是人力做不到的——100 个线程同一瞬间打，人工在界面上一个一个点不出来，而 T2 恰恰是双扣高发区；稳定覆盖失败注入，比“祈祷网络断一下”可靠；自动留痕证据（库里 1 条 vs 10 条就是书面证明）。

**弊**：竞态靠时序复现，自动化测试会 flaky（时过时不过），需要提高并发度或改用“确定性插桩”；失败注入需要 Chaos 工具或测试钩子权限，普通环境可能没有；脚本必须能查副作用（连库 / 查余额），因此强耦合测试环境，环境一变脚本就坏；幂等键生成逻辑要在脚本里复刻，业务规则一改脚本要跟着改；分布式下跨服务、跨库的“只发生一次”断言会因时钟偏移、消息乱序而误报或漏报；自动化“通过”不等于生产不出事，故障模式更多；业务边界与探索性场景仍需要人去读代码、问开发、找“没想到会重复的入口”。

推荐落地路线：先手动跑通 T1–T3 验证思路 → 固化成 Locust / pytest 脚本接 CI → 逐步加 Toxiproxy 故障注入 → 最后再上 Chaos Mesh 做全链路。可参考配套工程 [`idempotency-test-demo`](https://github.com/rawqing/idempotency-test-demo) 作为起点。

---

## 七、写在最后

幂等测试的难点从来不在“会不会写”，而在于敢不敢默认“请求一定会被重复投递”——多数系统的双扣，都死在这个假设没有被验证过。
