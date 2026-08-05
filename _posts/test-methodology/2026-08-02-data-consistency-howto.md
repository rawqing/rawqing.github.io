---
layout: post
title: 数据一致性到底该怎么测？
subtitle: 一套把数据一致性测透的落地方法
date: 2026-08-02
author: 雨落寒霜
tags: 数据一致性 测试方法论 一致性测试
---

## 引子

一笔订单的状态从“待发货”流转到“已发货”，运营在后台（走 MySQL） 看到已是“已发货”；可用户在前端搜索列表（走 ES）里刷新，订单还挂在“待发货”下。这不是偶发抖动，而是同一份数据在两个存储里，暂时不是同一份。

## 一、先搞清楚：什么是数据一致性

### 1.1 一致性不是“一致 / 不一致”，而是连续梯度

一致性测试的第一个坑，是没搞清楚被测系统到底承诺了哪种一致性模型，就拿“读到了旧值”当 bug。事实上一致性不是“一致 / 不一致”的二元开关，而是一条从“最强”到“最弱”的连续梯度——系统只是在这条线上选一个点，对外承诺“我只保证到这个强度”。

- 最强档有两个常被并列的模型：线性一致（单对象）与严格可串行化（多对象事务）——前者保证单对象操作尊重实时序、绝不“时间倒流”；后者是线性一致性在多对象事务层面的推广，要求跨对象事务的全局顺序既要尊重实时序、又要像按某次串行执行得出。二者是不同粒度下的最强保证（单对象 / 多对象），下面表格拆成两行。
- 最弱：最终一致——没新写入后，副本过一阵子终会一样，但中间有段“不一致窗口”；
- 中间还有顺序一致、因果一致、会话级保证等。


![一致性强度梯度](/assets/img/一致性强度梯度.svg)

CAP 定理（Brewer 在 2000 年 PODC 提出，Gilbert 与 Lynch 在 2002 年给出形式化证明）告诉我们：在存在网络分区（P）的分布式系统中，线性一致性级别的强一致（C）与可用性（A）只能二选一。因此“最终一致性”不是偷工减料，而是在分区下换取高可用的理性权衡[3]。

常见模型从强到弱：

<table>  
  <colgroup>  
    <col style="width:22%">  
    <col style="width:39%">  
    <col style="width:39%">  
  </colgroup>  
  <thead>  
    <tr>  
      <th>模型</th>  
      <th>含义（大白话）</th>  
      <th>测试该断言什么（验收规则）</th>  
    </tr>  
  </thead>  
  <tbody>  
    <tr>  
      <td>线性一致性 / 原子性（单对象，最强之一）</td>  
      <td>单个对象的每次读写像在调用与返回之间的某个瞬间原子生效，且尊重真实时间序；绝不会“后发的读却看到更早的状态”</td>  
      <td>单对象并发读写下，绝不会出现刚写入的值随后读不到、或读到更老的值（无“时间倒流”）</td>  
    </tr>  
    <tr>  
      <td>严格可串行化（多对象事务，最强之一）</td>  
      <td>在线性一致的基础上，进一步要求跨对象的事务满足可串行化——多对象操作的全局顺序既要尊重实时序，又要像按某次串行执行得出</td>  
      <td>多对象事务并发下，既无“时间倒流”，事务之间也像被串行执行（不出现跨对象的隔离违例）</td>  
    </tr>  
    <tr>  
      <td>顺序一致性</td>  
      <td>每个节点的操作自己这边顺序不乱，但不同节点之间不保证符合真实时间</td>  
      <td>单节点视角操作顺序保持；跨节点只要求最终对“发生了什么”有共识，不要求实时</td>  
    </tr>  
    <tr>  
      <td>因果一致性</td>  
      <td>若操作 B 依赖操作 A（如先看帖再评论），所有人看到的顺序都得是“先 A 后 B”；无依赖的可乱序</td>  
      <td>有依赖的操作全局顺序不被颠倒；无依赖的可以任意交错。如：同时评论，则展示的先后顺序无关紧要</td>  
    </tr>  
    <tr>  
      <td>会话级保证</td>  
      <td>只保你自己的会话：你写过的自己随后总能读到（read-your-writes）；且不会读到比上次更老的值（monotonic-reads，读不回退）</td>  
      <td>同一会话内，写之后读自己一定看到新值；反复读不会倒退回旧值</td>  
    </tr>  
    <tr>  
      <td>最终一致性（最弱）</td>  
      <td>写入后不保证立刻到处一致，但没新写入过一会儿所有副本都会一样；中间这段“不一样”叫不一致窗口</td>  
      <td>窗口内允许读到旧值（stale）；窗口外必须已收敛，且收敛时间不超过约定 SLA（服务等级协议）</td>  
    </tr>  
  </tbody>  
</table>

模型只规定了“什么时候允许不一致”，但究竟“什么算真不一致”，要靠下一个概念来锁定。

### 1.2 一致性测试的靶心：不变量

无论模型怎么变，一致性测试的本质只有一句话：持续校验系统承诺的不变量（invariant，系统任何时刻都必须成立的事实）。

不变量是跨模型的“真理”。举几个例子：

- 账户总余额守恒：转入 + 转出 = 期初 + 变动；
- 订单唯一：同一个 order_id 不会既“已支付”又“已退款”冲突；
- 已支付金额 = 已扣金额；
- 主从库在收敛后应相等。

不变量不能只在“某一瞬间”校验——分布式系统里你无法同时读到所有副本，进行中的（in-flight）事务还会让快照半真半假。持续观测不变量通常用这几类手段：在写入路径埋双写 / 影子日志做对账采样；用静止（quiesce）/ 检查点（checkpoint）窗口对系统做一致性快照校验；周期比对两套记录集（见 3.2.3）；或对关键链路做影子读（shadow read）。具体选哪种，取决于你的数据规模与可接受的观测延迟。

### 1.3 六种常见的“数据分叉”现场

把“数据一致性”拆成六个可独立测试的维度，每个维度有专属的故障模式：

| 维度             | 典型故障（详细展开见第三章）   |
| -------------- | ---------------- |
| ① 多副本 / 主从复制   | 复制延迟 / 脑裂 / 回滚   |
| ② 缓存与数据库       | 旧值回填 / 失效策略失效    |
| ③ 跨系统 / 跨服务    | 缺失 / 多余 / 字段不一致  |
| ④ 数据管道 CDC     | 数据丢失 / 重复 / 乱序（同一条数据可能漏传、多传或顺序错） |
| ⑤ 分布式事务        | 非原子写 / 补偿失败      |
| ⑥ 真实系统线性一致（黑盒） | 操作历史（history）不满足承诺模型  |

这六种现场覆盖了从单库内部到跨集群的全部一致性风险面，第三章将逐维展开测法。

## 二、为什么值得专门做（而不是混进功能测试）

### 2.1 真实代价：几个经核实的事故

一致性缺陷的后果是真实且严重的。下面四个事故按“离业务越近越易触发、越往底层越不可逆”排列，每个都附一句话结论 + 它究竟坏在哪；来源均来自可溯源的论文 / 官方报告 / 业界复盘（见附录）。

- **[应用层 · 缓存 / 视图]** 门店责任人明明已改生效，门店列表里却还是旧负责人，用户一重复修改就被后端拦下（“修改后的负责人不能与当前负责人相同”）。
  - *根因*：责任人写入已提交（DB 已是新值），但门店列表这个读视图（走缓存或异步构建）还停在旧值——典型的“写已生效、读视图未收敛”窗口。用户看到旧值、以为没改成功才去重复操作，结果被基于旧视图的校验误伤。这正是一致性窗口内读到旧值（stale）在业务上酿成真实故障的现场。
- **[应用层 · 业务代码]** 订单进了 DB，却没人知道。
  - *根因*：双写（dual-write）——一个订单要同时写 DB、发 Kafka、更缓存、发通知；若“写 DB 成功、发 Kafka 失败”，就出现 DB 有单但其他系统不知情的脏不一致。根治靠 CDC（如 Debezium：监听 binlog 实时同步）把数据库事务日志作为唯一真相源。
- **[基础设施层]** 断电一次，13 万条已确认消息消失。
  - *根因*：NATS JetStream 默认每 2 分钟才 fsync 一次（#7564），一致性窗口内“已确认”的写入只存内存；Jepsen 模拟协调式断电复现，单次丢失 131,418 / 930,005 条。此外快照文件损坏可删整条 stream（#7556），OS 崩溃还会脑裂（#7567）（Jepsen 官方报告[5]）。
- **[核心协议层]** 罕见竞态下，数据永久丢失且常规测试测不出来。
  - *根因*：AWS 用 TLA+ 验证核心协议，发现 19 个传统测试没发现的 bug，最严重的是 DynamoDB 复制层一次选主竞态，该竞态可能导致已提交的数据不可逆丢失[4]。

> 共同点：这些事故没有一个是“功能写错”，全是“多份数据 / 多个视图最终没对上”。它们最易在线上暴露，但若线下环境与线上同构、也具备真实的数据同步机制，同样能在线下发现。这正是它需单列成专项、而非顺带归进功能测试的原因。

下面这张全景图把三层风险摆在一起看——应用层、基础设施层、核心协议层，越往下后果越不可逆、越难被常规测试撞到：

![一致性风险全景图](/assets/img/一致性风险全景图.svg)

从应用代码到基础设施再到核心协议，一致性缺陷横贯全技术栈，越往底层越致命、越难被功能测试撞到。

### 2.2 隐蔽性：功能测试通过，线上才暴露

一致性缺陷和“功能对错”是两回事。下面这张表把两类测试的分工摆清楚——功能测的是“单个请求对不对”，一致性测的是“一堆请求交织后各视图还说不说得通”：

| 维度   | 功能测试               | 一致性测试                |
| ---- | ------------------ | -------------------- |
| 验证对象 | 单个请求的输入输出对不对       | 多个存储、多个时间点的状态是否彼此说得通 |
| 暴露时机 | 串行执行即暴露（单请求逻辑 bug） | 藏在并发与时序里，线上才暴露       |
| 典型盲区 | 不验证跨存储视图是否一致       | 不验证单请求内的业务逻辑正确性      |

一个读请求在缓存命中时返回旧值，功能上它“成功返回了”，但和业务的其他视图已经不一致——所以它常绕过功能用例，在并发真正发生的线上才暴露。这也正是它必须单列成专项、不能被功能测试顺带覆盖的原因。

### 2.3 边界：明确“不测什么”

和任何专项一样，划清边界比堆用例更重要：

- 不测非一致性维度的功能正确性（归功能测试）；
- 不测性能 / 容量本身（仅当影响“不一致窗口 SLA”时才纳入）；
- 不测第三方系统内部一致性（只测接口契约与跨系统对账边界）；
- 不测加密 / 安全合规细节（归专项安全测试）。

## 三、怎么测：一套可落地的方法体系

### 3.1 先确认好“一致性 SLA”再动手

SLA（服务等级协议）指系统承诺的一致性指标，包含三项：承诺模型（强一致 / 最终一致 / 线性一致…）、不一致窗口上限（如复制延迟 < 1s）、强一致读开关（如 majority 读）。这三项搞不清楚，后面六个维度的“测什么、判什么”就立不住——先对齐 SLA 是全文第一条红线，动手写用例前必须和研发 / 设计确认清楚。

### 3.2 六个维度的测法

这六个维度对应 1.3 的六种现场，3.2.1–3.2.6 逐维展开测法，3.2.7 为六维之外的补充手段。从 ① 到 ⑥ 大致按“从内部存储到跨系统、从组件级到黑盒级”递进：先测同一数据库内主库与从库之间的复制（维度①），再测它和缓存的交互（②），然后测跨系统的对账和管道（③④），最后测分布式事务和全链路一致性（⑤⑥）。读者可以按这个顺序理解，也可以按 3.4 的风险优先级选最致命的下手。

#### 3.2.1 主从复制：量化延迟，断言强一致读恒新

故障模式：写主库后从库短时 stale；强一致读路径若实现有误会返回旧值。

方法：① 轮询从库记录收敛时间，断言最终一致 < SLA；② 对强一致读路径断言始终读到主库最新值。


```python
store.write_master("k1", "v1")
t0 = time.monotonic()
lag = None
# 轮询从库直到收敛，记录耗时（不一致窗口）；未收敛则 lag 保持 None
while time.monotonic() < t0 + SLA:
    if store.read_replica("k1") == "v1":
        lag = time.monotonic() - t0
        break
    time.sleep(0.05)                      # 避免忙等占满 CPU
assert lag is not None, "副本未在 SLA 内收敛（最终一致窗口超时）"
assert lag < SLA                          # 收敛时间未超窗
assert store.read_master("k1") == "v1"   # 强一致读恒新（读主）
# 真实强一致读路径（如 DynamoDB ConsistentRead / MongoDB majority readConcern / 多数派 quorum 读）
# 也应断言“读到了最新提交”，而非只断言读主库本身：
assert store.read_strong("k1") == "v1"   # 强一致读路径恒新（经显式强一致开关）
```

从库短暂返回旧值是最终一致性允许的窗口，测试不必报错；这正说明“先确认一致性 SLA”是断言的基线，不是多余的动作。

注意：上面片段里的 `read_master` 断言只验证了“读主库得到主库的值”。真实系统的**强一致读路径**往往不是简单读主（例如 DynamoDB 的 `ConsistentRead`、MongoDB 的 `majority` readConcern、或多数派 quorum 读），这些路径才是不一致真正可能发生的地方。断言要落到“是否读到了最新提交”，如片段中的 `read_strong`，而非只断言读主库本身。

#### 3.2.2 缓存与 DB：并发复现旧值回填竞态

故障模式（Cache-Aside，读时回填、写时删缓存）：读路径本身是“缓存未命中→查 DB→把 DB 值写回缓存”的正常逻辑。竞态出在并发时序：读请求查到旧值、还没写回缓存；写请求改 DB 为新值并删缓存；读请求才把自己当初读到的旧值写回——缓存变回旧值，持续到 TTL。bug 来自时序交错，而非读路径那个写回动作本身。

被测对象只是个正常的 Cache-Aside 读路径：

```python
def cache_aside_read(cache, db, key):
    v = cache.get(key)
    if v is None:
        v = db.get(key)
        cache.set(key, v)          # 正常回填
    return v
```

**测法：故障注入 + 对账。** 这类问题只在并发下出现，所以分两步：① **故障注入**——人为制造会触发竞态的并发压力；② **注入后对账**——停止并发、静默收敛后断言“缓存若命中则必等于最新 DB 值，为空也合法”（Cache-Aside 下未命中是正常态，下次读会回填）。验证的是**最终不变量**而非某一瞬间：只要缓存最终残留了旧值，就一定会被对账抓住。

注入有两个维度。**维度一：读/写路径的并发时序**——起多个 reader 持续走读路径、writer 持续改库并删缓存；提高 reader 数、压低 writer 翻转间隔（`time.sleep` 调小）可放大“取值未回填”撞上“删缓存”的窗口。更稳的做法是**确定性交错注入**：用 Hook 插桩 `db.get` 返回点，让 reader 在“取旧值—回填”间显式让位给 writer 删缓存，**被测读路径零侵入**且每条 CI 必复现（而非靠随机调度偶发漏报）。**维度二：写路径自身失败**——删缓存因超时 / 主从延迟 / 进程崩溃没执行，残留旧值且无需并发窗口触发；用“主动让删缓存失败 / 推迟生效”注入即可，对账方式同维度一。

下面给出核心片段（内存假对象，不依赖真实 Redis / 数据库）：

```python
import threading, time

# 以下 TtlCache / FakeCache / FakeDB / cache_aside_read 为示意组件，
# 分别代表“带 TTL 的缓存”“普通缓存”“内存假 DB”“Cache-Aside 读路径”。
def test_cache_consistency_under_load():
    cache, db = TtlCache(ttl=0.05), FakeDB()   # TTL 兜底，对账才能稳定收敛
    db.set("u1", "Tom")
    stop = threading.Event()

    def reader():                              # 多个 reader 持续走真实读路径
        while not stop.is_set():
            cache_aside_read(cache, db, "u1")

    def writer():                              # writer 持续改库 + 删缓存
        flip = {"v": "Jerry"}
        while not stop.is_set():
            db.set("u1", flip["v"]); cache.delete("u1")
            flip["v"] = "Tom" if flip["v"] == "Jerry" else "Jerry"
            time.sleep(0.001)                  # 间隔越短、reader 越多，窗口越易被放大

    for t in [threading.Thread(target=reader) for _ in range(4)] \
           + [threading.Thread(target=writer)]:
        t.start()
    time.sleep(0.5); stop.set()               # 注入期：并发施压，逼出竞态窗口

    time.sleep(0.1)                            # 注入后对账：等超 TTL，断言终态无旧值残留
    latest, cached = db.get("u1"), cache.get("u1")
    assert cached is None or cached == latest
```

**（可选进阶）第 3 层（确定性交错）** 不需重写整套线程脚手架，只在上面基础上替换 `db.get` 为 Hook，让 writer 在 reader 取完旧值、尚未回填时插一脚删缓存：

```python
def hook_db_get(orig, before_refill, after_writer):
    def wrapped(key):
        v = orig(key)
        if key == "u1" and before_refill.is_set():
            before_refill.clear(); after_writer.wait()   # 让位：等 writer 改库+删缓存
        return v
    return wrapped

def test_deterministic_interleave():
    cache, db = FakeCache(), FakeDB()
    orig_get = db.get                              # 保留原始 DB 读取，供 reader 检查 stale 时绕过 Hook
    before_refill, after_writer = threading.Event(), threading.Event()
    db.get = hook_db_get(orig_get, before_refill, after_writer)  # 仅替换 DB 接口
    db.set("u1", "Tom"); stale = {"hit": False}; stop = threading.Event()

    def reader():
        while not stop.is_set():
            cache_aside_read(cache, db, "u1")              # 被测函数原样调用
            # 检查 stale 时用原始 DB 读取，避免触发 Hook 逻辑导致行为不确定
            if cache.get("u1") not in (None, orig_get("u1")):
                stale["hit"] = True

    def writer():
        flip = {"v": "Jerry"}
        while not stop.is_set():
            before_refill.set(); db.set("u1", flip["v"]); cache.delete("u1")
            after_writer.set()                             # 放行被钩住的 reader 回填→旧值写回
            flip["v"] = "Tom" if flip["v"] == "Jerry" else "Jerry"
            time.sleep(0.001); after_writer.clear()

    for t in [threading.Thread(target=reader) for _ in range(4)] \
           + [threading.Thread(target=writer)]:
        t.start()
    time.sleep(0.3); stop.set()
    for t in threading.enumerate():
        if t is not threading.main_thread(): t.join()
    assert stale["hit"]                                   # 每次必触发，CI 可稳定复现
```

**修复思路**（不止延时双删）：延时双删（写后延时再删一次清窗口）配合“注入后对账”验证即可；TTL 兜底作最后防线（脏值终会过期，但不解决窗口内读到旧值的业务问题）；binlog/CDC 驱动失效（如 Canal）把删缓存从请求路径剥离、对业务代码零侵入。架构上也可用 Read-Through / 单飞缓解。

> 把“注入后对账”固化成生产常驻检查（周期比对缓存 vs DB、带容差与审计），以及用 JMeter / Chaos Mesh 把上面的并发与写路径失败推到真实流量与真实故障，都属“工具放大器”范畴，详见 4.1。

#### 3.2.3 跨系统对账：缺失 / 多余 / 不一致 + 容差 + 审计

故障模式：两套记录集（如 MySQL 源与 ES 目标）出现缺单、多单、字段对不上。回到引子的场景：MySQL 里订单状态已是“已发货”，ES 里还是“待发货”，就是对账要抓的差异。

方法：周期性比对，定位差异并区分“真不一致”与“时序未收敛”（timing_pending）。**前者**（value_mismatch / missing_*）是对账要抓的真差异，**后者**是同步管道的正常延迟、属时序窗口内允许的状态，不误报——这也是金融和生产线上的标准兜底手段。

**测法：对账的核心是“周期性触发比对 + 断言只出现预期差异”**。被测对象 `reconcile` 只做比较（金额用整数“分”杜绝浮点误差，容差由一致性 SLA 定义）；测试的职责是：① 周期性拉取两套记录集、调 `reconcile`；② 断言 `value_mismatch / missing_in_target / missing_in_source` 为空（真差异），而把仍在窗口内的 `timing_pending` 当作“未收敛”放过、不误报。核心片段如下（`reconcile` 为示意接口，返回上述三类差异集合）：

```python
import time

def test_reconcile_no_real_mismatch():
    # —— 测试职责①：周期性触发比对 ——
    for _ in range(20):                      # 多轮，让 CDC 把变更逐步搬过来
        rep = reconcile(
            mysql_orders(), es_orders(),
            key="order_id",
            fields=["status", "amount_cents"],   # amount_cents 为整数分
            tolerance_cents=0,                   # 等额才算一致；或按 SLA 给阈值
            pending_keys=still_in_flight(),      # 仍在窗口内的单：基于 binlog 位点/时间戳判定尚未同步完成的 key，算 timing_pending
        )
        # —— 测试职责②：只断言“真差异”为空 ——
        assert rep.value_mismatch == []
        assert rep.missing_in_target == []
        assert rep.missing_in_source == []
        # timing_pending 是正常时序窗口，不算 bug，不在此断言
        time.sleep(0.5)

    # 收敛后，pending 也应清空
    assert reconcile(mysql_orders(), es_orders(),
                     key="order_id", fields=["status", "amount_cents"],
                     tolerance_cents=0).timing_pending == []
```

对账（reconciliation）是金融与生产线上的标准兜底手段；据实务经验与反舞弊框架[8]，其价值不在“找 bug”，而在“持续兜底 + 留审计轨迹”。

#### 3.2.4 CDC 管道：分块校验和 + 行级 diff 降级

故障模式：MySQL binlog → CDC 消费（Canal / Debezium）→ ES 的同步管道可能丢 / 重 / 乱序，exactly-once（工业上 = at-least-once + 幂等消费）未兑现。引子里“状态写进 MySQL 却没及时进 ES”，根因往往就在这条链路的消费延迟、背压或消费失败[6]。与 3.2.3 的分工：对账负责发现“两边不一样”，本节负责解释“为什么会不一样”。

方法：对每行字段拼接算哈希，按 chunk（按主键分桶或分页）聚合校验和，源端（MySQL）与目标端（ES）按 chunk 比对，不一致再降级到行级 diff 定位。

**测法：CDC 校验的核心是“在管道两端取快照、算校验和、比对并断言无坏块”**。被测对象 `row_checksum / chunk_checksums / diff_rows` 只做哈希与比对；测试的职责是：① 在源端、目标端分别取同一批数据的快照；② 算两端 chunk 校验和并比对，断言 `bad_chunks` 为空（无丢/重/乱序造成的块级差异），必要时再用 `diff_rows` 行级定位。核心片段如下（`chunk_checksums / diff_rows` 为示意接口）：

```python
def test_cdc_no_corruption():
    fields = ["status", "amount_cents"]
    # —— 测试职责①：在管道两端取同一批数据的快照 ——
    src = snapshot_from_mysql()        # 源端快照
    tgt = snapshot_from_es()           # 目标端（经 CDC 同步后）快照

    # —— 测试职责②：算两端校验和并断言无坏块 ——
    sc = chunk_checksums(src, fields, "id")
    tc = chunk_checksums(tgt, fields, "id")
    bad_chunks = [k for k in sc if sc[k] != tc.get(k)]
    assert bad_chunks == [], f"CDC 导致坏块：{bad_chunks}"

    # 必要时行级 diff 定位具体差异行
    rows = diff_rows(src, tgt, fields, "id")
    assert rows == [], f"行级差异：{rows}"
```

被测对象 `row_checksum` 的关键细节（规范化同义值、长度前缀编码防分隔符歧义）：

```python
def canon(value):
    # 规范化：统一同义值的序列化，避免 1.0/1.00、时区、NULL/空串 造成假不等
    if value is None:
        return ""                       # 与空串统一（或按业务显式区分）
    if isinstance(value, float):
        return format(value, ".2f")     # 定点化，消除浮点尾差
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc).isoformat()
    return str(value)

def row_checksum(row, fields):
    # 用长度前缀编码，避免字段值含分隔符“|”导致歧义（如 "a|b" 与 "a","b" 同哈希）
    payload = "\x1f".join(
        f"{len(canon(row.get(fld, ''))):d}\x1f{canon(row.get(fld, ''))}" for fld in fields
    )
    return hashlib.md5(payload.encode()).hexdigest()
```

#### 3.2.5 分布式事务：补偿路径 + Outbox

故障模式：2PC（两阶段提交）/ TCC（Try-Confirm-Cancel 补偿型事务）/ Saga（长事务编排）/ Outbox 下，跨服务写非原子，或补偿（compensation）失败，留下脏不一致。

方法：① 测补偿路径——主动注入“第二步失败”，断言系统能回滚或补偿到一致态；② 优先用 Outbox 模式（把“写业务表”和“发消息”放进同一个本地事务，再由 CDC 投递），从根上消除双写。

本维度难以用一套通用用例覆盖：分布式事务高度依赖业务建模（Outbox 表设计、补偿动作幂等），因此测试以“注入失败看补偿能否把不变量拉回”为主，需结合具体业务写用例，而非套用模板。下面给出简单示例（注入第二步失败→断言补偿后不变量恢复）：

```python
def test_saga_compensation_restores_invariant():
    # —— 准备：初始不变量成立 ——
    assert invariant_holds()                       # 如：账户余额 = 订单总额
    order = create_order(amount_cents=10000)       # 创建一笔订单（Try 阶段）

    # —— 注入：让第二步（如扣款）失败 ——
    with inject_failure(pay_service, "confirm", raise_=ServiceUnavailable):
        try:
            saga.execute(order)                    # 执行 Saga：建单 → 扣款 → 通知
        except CompensationTriggered:
            pass

    # —— 断言：补偿后不变量恢复 ——
    assert saga.is_compensated(order.id)           # Saga 已标记补偿完成
    assert invariant_holds()                       # 不变量被拉回（余额未扣、订单已回滚）
    assert order_status(order.id) in ("cancelled", "rolled_back")
```

#### 3.2.6 线性一致：Jepsen / Porcupine 校验 history

故障模式：黑盒视角下，关键链路在故障注入后不满足承诺的线性一致模型（出现“时间倒流”）。

**结论先行**：生产环境直接交给成熟工具——构建系统、注入故障（网络分区 / 进程 kill / 时钟跳变）、记录 history（每次操作的起止时间与读写值），用 Jepsen / Porcupine 判定。**单寄存器（单对象的 read/write）你可以自己写 checker**（下面给出最小思路）；但**多对象、或语义更丰富的单对象（如队列 / 栈）不要自研校验器**——这类判定是 NP 完全量级的搜索问题，自研极易写错（4.3 就有个真事）。

> 注（写给想深究的人）：线性一致性的判定已被证明是 NP 完全问题（Gibbons & Korach, 1997），即使是单个 read/write 寄存器也不例外；不过单寄存器在实践中仍可用启发式 / 分支限界算法（如 Wing-Gong 算法、Porcupine 的 WGL 算法）高效处理常见规模的 history，而 FIFO 队列 / 栈等更丰富语义的判定则状态空间爆炸更严重、更难处理；更弱但实用的 k-atomicity（放宽到允许最多 k-1 个操作乱序的一致性模型）在 k≥3 一般情形是否高效可解仍是开放问题[7]。这些学术结论只是说明“为什么自研多对象 checker 不划算”，普通场景无需深究，直接用工具即可。


```python
# history 中每条 op 带 start/end 与读写值
# 线性一致 = 存在对 op 的全序，既尊重实时序，又满足寄存器规约
def is_linearizable(history):
    # 回溯构造：read 读到的值必须等于它之前最近一次 write 的值
    # （注意：须约束双向实时序——读不能发生在它“读到那次写”的起点之前）
    ...
# h1 可线性化=True；h2 中读在写之前发生（时间倒流）=False
```

Jepsen 与 TLA+ 互补：TLA+ 是白盒（对设计建模穷举状态空间，AWS 用它找到 19 个设计级 bug），Jepsen 是黑盒（对真实系统注入故障后校验 history，发现了 etcd 锁不互斥、TiDB 快照隔离违例等真实缺陷）。

#### 3.2.7 其他有力手段（简要补充）

六个维度之外，有几类工程上非常有效的补充手段，值得了解：

- **确定性模拟测试（deterministic simulation）**：FoundationDB、TigerBeetle 等用可控调度把并发不确定性变成可复现，能稳定复现“偶发”竞态，是当前最有力的手段之一；
- **差分 / 影子流量（differential / shadow traffic）**：用两套实现对同一输入跑，比对输出差异，对一致性尤为有效；
- **时钟与线性一致**：NTP 漂移、TrueTime / 高精度时钟会直接影响“时间倒流”判定；测线性一致时要把时钟误差纳入实时序约束，否则可能误判。

### 3.3 分层策略：L0–L3

> 下面这张表是本文方法的“体系全景”：

| 层级 | 名称          | 内容                          | 执行频率       | 环境           |
| -- | ----------- | --------------------------- | ---------- | ------------ |
| L0 | 单元 / 集成（CI） | 缓存竞态、复制延迟、对账、CDC 校验和、单对象线性化 | 每次提交       | 内存假对象 / 测试实例 |
| L1 | 系统级（半自动）    | Jepsen / Porcupine + 故障注入   | 每版本 / 定期   | K8s 受控       |
| L2 | 设计期         | TLA+ 对选主 / 复制 / 事务协调建模      | 里程碑 / 架构变更 | 设计期          |
| L3 | 生产兜底        | 周期性对账 + 校验和 + 告警            | 7×24       | 生产           |

### 3.4 风险驱动的优先级

资源按“发生概率 × 业务影响”排序，强一致 / 资损路径优先。下列评分为**演示性主观打分**（概率 P、影响 I 各取 1–5 分档，相乘得 1–25），仅用于说明排序方法、并非实测统计；分数已按“罕见但致命 vs 高频但轻”拉开区分度，落地时请结合本系统历史故障替换：

| 风险 | 描述（含演示性打分依据 P×I）                | 评分 | 缓解测试             |
| -- | ------------------------------- | -- | ---------------- |
| R1 | 选主 / 复制设计级竞态致数据丢失（罕见但不可逆，P2×I5） | 10 | L2 TLA+ 建模       |
| R2 | 缓存旧值回填致用户见旧数据（高频但影响轻，P4×I2）     | 8  | L0 竞态复现 + 延时双删   |
| R3 | CDC 管道数据丢失 / 重复 / 乱序（高频且可能资损，P4×I3） | 12 | L0 校验和 + 行级 diff |
| R4 | 分布式事务补偿失败致脏不一致（中频、影响中高，P3×I3）   | 9  | L0/L1 补偿路径测试     |

> **排序提醒**：分数越高风险越大，但优先级还需结合“不可逆性”加权——资损不可逆的路径（如 R1 选主竞态致数据永久丢失）即使总分略低于 R3，也应优先排期，因为不可逆故障无法靠事后补偿挽回。

> **方法论提醒（单列，不计入打分）**：R5「自动化虚假安全感」不是一种“故障”，而是“测试自身的风险”——过度依赖脚本会放松对设计 / 语义的审视，漏掉深层 bug。它靠 L2 人工 + TLA+ 兜底来对冲，故不与其他技术故障并列排序。

## 四、自动化能提效吗：工具是放大器，不是替代者

### 4.1 能自动化的

第三章的六个维度里，有三类工作可以全脚本化，共性很明确——参数可穷举、断言可公式化、环境可隔离，不需要人对系统语义做实时判断：

| 可脚本化工作 | 做法                              | 替代的人工     | 正文示例 |
| ------ | ------------------------------- | --------- | --- |
| 并发竞态复现 | `threading.Event` 精确编排读写交织时序；含写路径失败（删缓存未生效）注入 | 手工构造高并发环境 | 3.2.2 并发注入 + 第④类写路径失败 |
| 复制延迟度量 | 轮询从库、自动记录收敛时间                 | 人工掐表观察    | 3.2.1 复制延迟度量测法 |
| 对账与校验和 | 比对引擎定时比对两套记录集、分块校验和逐 chunk 定位差异 | 逐笔人工核对    | 3.2.3 对账片段、3.2.4 分块校验和片段 |

> 线性一致校验（3.2.6）的自研单对象 checker 也属此类自动化范畴，但**只覆盖单对象**——多对象的线性一致是 NP 完备量级的搜索问题，仍须交给 Porcupine / Jepsen。

剩下的是把脚本接上 **CI 流水线**（每次提交自动跑）、挂上**故障注入框架**（Chaos Mesh / Litmus 编排网络分区和进程杀）、配置 **Porcupine / 自研 checker** 校验 history 的线性一致性。这些工作的价值不在“发现新问题”，而是**把已知模式的检查变成没人需要点按钮的后台守卫**。

**生产级放大器：同一套测法，推到真实环境。** 第三章（尤其 3.2.2）用内存假对象 + `threading` 演示“故障注入 + 对账”，属于 L0——逻辑讲清、可回归、开箱即跑。要往真实流量与真实故障推进，工具是同一套测法的放大器，不是另一套方法：

- **压测施压（JMeter / Locust）**：替代手搓线程，起接近真实的并发读写流量。价值在流量形态更真（含思考时间、混合读写比），但测法内核没变——仍是“注入并发压力 + 注入后对账”。
- **故障注入（Chaos Mesh / Litmus）**：把 3.2.2 第④类“写路径失败”从手搓 `cache.delete` 跳过，升级成生产级故障——注入 Redis 主从复制延迟、kill 缓存进程、网络分区，让“删缓存没生效”真实发生，而非模拟。
- **对账常驻（7×24 后台）**：把 3.2.3 的“周期比对 + 容差 + 审计”从“CI 跑一次”挂成生产兜底任务（L3）；对象收窄到缓存 vs DB 单点时，仍按“空合法、命中必等最新”比对，抓运行时偶发残留。

放大器的边界：它们放大的是**已知模式**的检查，不替你发现新故障（故障场景仍要人设计，见 4.2）。L0 把“该竞态在逻辑上能发生”钉死在 CI；L1/L3 把同一条检查推到真实流量与持续运行。落地时把正文示例里的内存假对象换成真实客户端（如 `redis-py` + 真实 Redis、真实 MySQL 主从），或借助 testcontainers 起隔离实例，即可复用同一套“注入 + 对账”框架。

把正文示例接上 CI 也不复杂：将 3.2 各维度的核心片段抽成可独立运行的断言函数，放入 `tests/` 目录，在 CI 配置里加一步 `python -m pytest tests/` 即可。具体流水线怎么写取决于团队用的 CI 平台（GitHub Actions / Jenkins / GitLab CI），这里不再展开。

### 4.2 仍需人工的（机器做不了 / 做不好）

1. **SLA / 一致性模型确认**：机器不知系统承诺什么，须人与研发对齐；
2. **设计期形式化建模（TLA+）**：建模是高级智力活，工具只做穷举；
3. **故障场景设计**：随机注入只会产生噪音，需人基于对系统的理解设计；
4. **不变量定义**：脚本能校验“值相等”，但“业务上该相等吗”要人定义；
5. **差异归因与误报治理**：对账 / 混沌的大量差异需人区分“真不一致”与“未收敛”；
6. **业务语义校验**：金额、状态机、幂等等业务规则需人转化为断言。

### 4.3 利弊权衡

| 维度      | 利             | 弊 / 风险                           |
| ------- | ------------- | -------------------------------- |
| 执行效率    | 7×24 跑，替代重复比对 | —                                |
| 覆盖深度    | 枚举海量交错 / 数据组合 | 状态空间爆炸；多对象线性一致 NP 完备，无法穷举        |
| 设计级 bug | —             | 普通脚本测不到设计级缺陷（如选主竞态），须 TLA+ 且建模靠人 |
| 误报治理    | 规则固化减主观误差     | 断言 / 容差不当 → 大量误报淹没真问题            |
| 维护成本    | CI 守护每次发版     | 系统演进需同步维护，否则悄悄失效                 |
| 发布信心    | 持续守护提升信心      | 虚假安全感：过度依赖放松对设计 / 语义审视           |

> **脚本本身也可能出错——这是个真事，不是假设。** 笔者曾写过的单对象线性化 checker 初版只约束了实时序的**下界**、漏了上界，结果一条“读发生在写之前”（时间倒流）的 history 被误判为“可线性化”——校验脚本自己跑通过了，结论却是错的。修复版补上双向实时序约束后才正确。这正好给上表两行做注脚：**自研 checker 有 bug 会直接造成漏报**（覆盖深度行的 NP 完备之外，又一层风险），而**误报治理的前提是脚本自己先被验证过**。结论很朴素：能自动化的脚本，其正确性也得有人盯。

### 4.4 落地结论

按 3.3 的分层：L0 / L3 全脚本化进 CI 与生产；L1 半自动（人设计故障、机器执行）；L2 纯人工 + TLA+。三者缺一不可，避免“有自动化就放心”的陷阱。自动化提升的是“重复比对”的效率，扛不动“该测什么、怎么设计、差异意味着什么”的判断。落到本文：3.2.1 复制延迟度量、3.2.2 竞态复现、3.2.3 对账、3.2.4 分块校验和这四节给出的测法片段就是 L0/L3 的现成钉子，3.2.6 的单对象 checker 是 L2 的人机配合起点——其余交给人对系统语义的审视。

## 结语

一致性测试的红线只有一条：盯住不变量，把能重复的交给机器，把要动脑子的留给懂系统的人。

## 附录：引用与出处

> 正文中的 `[n]` 指向本节编号。

**论文 / 官方报告 / 规范**：

1. Brewer E. A. *Towards robust distributed systems* (PODC 2000 主题演讲) — CAP 提出。PODC 2000 邀请演讲页：<https://podc.org/podc2000/brewer.html>；演讲稿 PDF：<https://people.eecs.berkeley.edu/~brewer/cs262b-2004/PODC-keynote.pdf>
2. Gilbert S., Lynch N. *Brewer's conjecture and the feasibility of consistent, available, partition-tolerant web services.* ACM SIGACT News 33(2), 2002 — CAP 形式化。DOI：<https://doi.org/10.1145/564585.564601>；PDF：<https://groups.csail.mit.edu/tds/papers/Gilbert/Brewer2.pdf>
3. Vogels W. *Eventually Consistent.* CACM 52(1), 2009. <https://cacm.acm.org/practice/eventually-consistent/>
4. Newcombe C. et al. *How Amazon Web Services Uses Formal Methods.* CACM 58(4), 2015. <https://cacm.acm.org/research/how-amazon-web-services-uses-formal-methods/>（文中“19 个传统测试未发现的 bug”出自该文对多团队 TLA+ 应用的汇总；最严重的“DynamoDB 复制层选主竞态致不可逆数据丢失”见 DynamoDB 复制 / 组成员系统一节，模型检查器发现 3 个 bug，含一处需 35 步 trace 的选主竞态）。
5. Jepsen 分析报告. <https://jepsen.io/blog> （etcd / TiDB / MongoDB / NATS / Kafka）；NATS 2.12.1 专项：<https://jepsen.io/analyses/nats-2.12.1>（默认 2 分钟 fsync #7564、快照文件损坏删 stream #7556、OS 崩溃致脑裂 #7567，文中数字与结论均经该报告核实）。
6. Bufstream Jepsen Report（KAFKA-17754 / KIP-890）. <https://buf.build/blog/bufstream-jepsen-report>
7. Bailis P., Ghodsi A. *Eventual Consistency Today: Limitations, Extensions, and Beyond.* ACM Queue / CACM 2013（续作 *Eventually Consistent: Not What You Were Expecting?* CACM 2014）— k-atomicity 开放问题出处。k≥3 一般情形高效可解性未知，出自 CACM 2014 续作 “Open Problems” 段；k<3 已有算法。ACM Queue：<https://queue.acm.org/detail.cfm?id=2462076>；CACM 实践版：<https://cacm.acm.org/practice/eventual-consistency-today>

**工程复盘 / 实务（标注性质）**：

8. 金融对账与舞弊：ACFE 历年《全球职业舞弊报告》（Report to the Nations 档案），强调主动监测 / 账户核对类控制是反舞弊关键防线：<https://www.acfe.com/fraud-resources/report-to-the-nations-archive>；Atlar 银行对账实务指南：<https://www.atlar.com/guides/bank-reconciliation-a-practical-guide-for-finance-and-accounting-teams>
9. CDC / 双写问题 / Outbox：Debezium 官方文档：<https://debezium.io/documentation/reference/>；Flink CDC 官方文档：<https://flink.apache.org/documentation/flink-cdc-stable/>。
