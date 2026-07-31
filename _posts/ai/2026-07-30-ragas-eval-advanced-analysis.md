---
layout: post
title: 'RAGAS评测：隐藏在指标分数后的黑手'
subtitle: '分数的假象 · 裁判的非确定性 · 逐条诊断 · 四层可信模型 —— 一套把 RAGAS 分数读对的工程方法'
date: 2026-07-30
author: 雨落寒霜
tags: RAGAS 评测 RAG LLM 大模型 裁判偏差
---

# RAGAS评测：隐藏在指标分数后的黑手

## 一、一个让人不安的 1.0

用户问 RAG 系统："退款周期一般是多久？"

系统检索回来的上下文只有产品手册的目录树——章节标题、页码。没有任何关于退款时效的实质内容。系统据此生成答案：*"根据提供的信息无法确定退款周期。"*

这个答案的 Faithfulness 是多少？

满分。

![Faithfulness 判定链路：空话如何得满分](/assets/img/faithfulness-pipeline.png)

检索器几乎完全失败，连一段相关正文都没捞回来。指标却给了满分，把失败盖住了。

Faithfulness 高分还以另外两种隐蔽面目出现：

**错误章节命中。** 用户问"正式员工离职要提前多久申请"，检索命中了"试用期员工离职需提前 3 天通知"——「离职」「提前」「天数」等关键词高度重叠，但那段针对的是试用期。系统忠实于这段错误的上下文，回答"需提前 3 天通知"。这句话的每个字都能从检索到的 chunk 推出，Faithfulness 满分。但对正式员工，答案错了。

**过泛复述。** 用户问"年假到底多少天"，context 只写 *"公司按工龄和职级提供相应年假"*，答案回 *"具体天数按公司制度执行"*——满分，但用户什么也没得到。

这三种情形的共同点只有一句话：**Faithfulness 高分只保证答案的每句话在上下文里找得到依据，从不保证上下文本身是相关的、有信息量的、或者答对了问题。** 一个 Faithfulness 0.95，可能是"答案完美"，也可能是"检索失败被掩盖"、"错误段落被当真"、或者"零信息量的废话被当成好答案"。只看总分，你永远分不清是哪一种。RAGAS 的分数，到底是反映系统质量的镜子，还是一场虚高的分数假象？

---

## 二、指标分数正在偷走你的判断力

"看分数"这个动作背后，藏着三个没被挑明的假设。

### 2.1 我们默认了"分数 = 事实"

拿到 0.95，下意识把它当成"系统可靠"的证据。但这个分数的可信度从哪来？它来自一个 LLM 裁判对另一个 LLM 输出的判断，而这套判断本身有偏差、有噪声。在没有任何校准的前提下，把 0.95 直接读作"系统健康"，是把假设当成了结论。

### 2.2 RAG 的故障有两个来源，单点指标看不全

![RAG 双段故障：单点指标看不全](/assets/img/rag-two-stage-failure.png)

RAG 由检索和生成两段链路串联，任一段出问题答案就错。下表把一个错误答案拆成三种来源：

| 失败模式 | 检索段 | 生成段 | 指标读数 | 隐蔽性 |
|---|---|---|---|---|
| 没召回正确内容 | ✗ 失效 | ✓ 正常 | faithfulness 可能仍高（真空高分最典型） | 中 |
| 召回了但被忽略 | ✓ 命中 | ✗ 失效 | faithfulness 偏低，易被发觉 | 低 |
| 没召回却凭记忆蒙对 | ✗ 失效 | 用了自身记忆 | 分数反而漂亮 | 高（最危险） |

第三种最隐蔽：检索已经失效，答案却凭模型记忆碰巧正确，单看 faithfulness、answer_correctness 反而分数漂亮。

问题在 RAGAS 的多数指标只测量一个环节，没有一个能同时回答"检索和生成哪个坏了"：

| 指标 | 实际测量的环节 | 测不到的环节 |
|---|---|---|
| faithfulness | 生成是否忠于已召回的 context | 检索是否命中 |
| context_recall / precision | 检索是否命中 | 生成质量 |
| answer_correctness | 事实正确性（混合） | 不定位"哪段坏的" |

用单点信号诊断双段系统，天然漏掉一半故障——这正是 faithfulness 高分却掩盖检索失败的深层原因。

### 2.3 用 LLM 评 LLM，本质上是结构性的利益冲突

CALM 框架（Ye et al., 2024, ICLR 2025）系统列举了 LLM-as-a-Judge 的 12 类系统性偏差：

| 归类      | 偏差                     | 表现                        |
| ------- | ---------------------- | ------------------------- |
| 呈现偏见    | 位置 Position            | 按答案排列顺序给偏好，常偏爱排在前面的       |
| 呈现偏见    | 冗长 Verbosity           | 不管质量，偏爱更长（或更短）的回答         |
| 呈现偏见    | 同情心消退 Compassion-Fade  | 对署名的模型和匿名引用区别对待           |
| 认知偏见    | 从众 Bandwagon           | 受"多数人认为更好"暗示影响            |
| 认知偏见    | 干扰 Distraction         | 对无关细节过度关注，被带偏             |
| 认知偏见    | 谬误忽视 Fallacy Oversight | 忽略回答里的逻辑错误                |
| 认知偏见    | 权威 Authority           | 对有引用/权威出处的陈述过高评价（哪怕引用是编的） |
| 情感与社会偏见 | 情感 Sentiment           | 偏爱积极或消极情绪表达               |
| 情感与社会偏见 | 多样性 Diversity          | 对特定人口/身份群体的歧视             |
| 方法论偏见   | 思维链 CoT                | 判断随"是否显式写出推理步骤"而变化        |
| 方法论偏见   | 自我增强 Self-Enhancement  | 偏爱同家族模型生成的回答              |
| 方法论偏见   | 精炼感知 Refinement-Aware  | 对"经过润色"的回答给出不同评价          |

其中三类对 RAG 评测最致命：

- **自我增强偏差**：RAG 系统用 GPT-4o 生成答案，评测时也用 GPT-4o 当 judge，分数会系统性虚高。模型倾向于认为"自己人"的输出质量更高——这不是主观作弊，是认知偏差。
- **位置偏差**：pairwise 比较时，judge 倾向于给列表中第一个出现的答案高分。同一个答案放第一位和最后一位，分数可能明显偏移。
- **冗长偏差**：更长的回答得分更高。被测系统若倾向输出冗长答案，Faithfulness 可能被低估（更多 claim 增加出错机会），Answer Relevancy 反而被高估。

这 12 类之外，工程落地时还有两类最常冲击 Faithfulness 的行为——**非确定性与字面化判定**。同一个答案跨次运行分数漂移（非确定性），以及把"主要产物"这类同义表述字面对应为"无依据"（字面化）。它们不在 CALM 的 12 类里，却是后文实验里最刺眼的问题。

第三方研究（如 Beatrust 2024 的 RAG 评测实验）报告 RAGAS 指标与人工评分的相关性只在中等级别。用 LLM 裁判的分数做最终判断而不校准偏差，等于把假设当结论。

---

## 三、把一次评测完整拆开来看

以下将一次真实的 debug 实验完整展开——数据、代码、控制台日志完整保留，不作删节。

环境：`ragas==0.2.15`，judge 模型 `deepseek-v4-pro`（走 OpenAI 兼容网关），Python 3.13。**整个实验从头到尾 temperature=0。**

### 3.1 评测数据集（完整，一字未删）

5 道常识问答，每题都配了与答案高度吻合的检索上下文和人工参考答案：

```python
eval_dataset = {
    "question": [
        "爱因斯坦因什么获得诺贝尔奖？",
        "光合作用的主要产物是什么？",
        "Python 中列表和元组的主要区别是什么？",
        "什么是机器学习中的过拟合？",
        "水的化学式是什么？",
    ],
    "answer": [
        "爱因斯坦因光电效应的理论解释获得1921年诺贝尔物理学奖。",
        "光合作用的主要产物是葡萄糖（C₆H₁₂O₆）和氧气（O₂）。",
        "列表（list）是可变的，可以修改其元素；元组（tuple）是不可变的，创建后不能修改。列表使用方括号[]，元组使用圆括号()。",
        "过拟合是指模型在训练数据上表现很好，但在新数据上表现差的现象，通常因为模型过度学习了训练数据中的噪声和细节。",
        "水的化学式是 H₂O，由两个氢原子和一个氧原子组成。",
    ],
    "contexts": [
        [
            "阿尔伯特·爱因斯坦因对理论物理的贡献，特别是光电效应定律的发现，获得1921年诺贝尔物理学奖。",
            "爱因斯坦提出了狭义相对论和广义相对论，彻底改变了物理学。",
            "光电效应是指光照射到金属表面时，电子会被激发出来的现象，爱因斯坦用光子假说成功解释了这一现象。",
        ],
        [
            "光合作用是植物、藻类和某些细菌利用光能将二氧化碳和水转化为有机物并释放氧气的过程。",
            "光合作用的总反应式：6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂，产物是葡萄糖和氧气。",
            "叶绿体是进行光合作用的细胞器，其中含有叶绿素。",
        ],
        [
            "Python 中的列表（list）是可变的序列类型，可以添加、删除和修改元素。",
            "元组（tuple）是不可变的序列类型，一旦创建就不能修改其内容。",
            "由于元组不可变，它可以作为字典的键，而列表不能。列表通常用于存储同类型的数据集合。",
        ],
        [
            "过拟合（overfitting）是机器学习中常见的问题，指模型在训练集上表现优异但在测试集上表现不佳。",
            "过拟合通常发生在模型过于复杂，参数量过多，而训练数据相对较少的情况下。",
            "解决过拟合的方法包括：增加训练数据、使用正则化（L1/L2）、Dropout、早停（early stopping）等。",
        ],
        [
            "水（Water）的化学式是 H₂O，摩尔质量为 18.015 g/mol。",
            "水分子由一个氧原子和两个氢原子通过共价键连接而成，分子结构呈 V 形。",
            "水是地球上最常见的物质之一，被称为'通用溶剂'，是生命存在的基础。",
        ],
    ],
    "ground_truth": [
        "爱因斯坦因光电效应的理论解释获得1921年诺贝尔物理学奖。",
        "光合作用的主要产物是葡萄糖和氧气。",
        "列表可变，元组不可变；列表用[]，元组用()。",
        "过拟合是模型在训练数据上表现好但泛化能力差的现象，因模型过度学习训练数据中的噪声导致。",
        "水的化学式是 H₂O。",
    ],
}
```

每组数据都存在明显的对应关系：context 对每题都给了充足的事实支撑，answer 几乎就是 context 的浓缩表述。从定义出发，五条样本的 Faithfulness 理应全部接近或等于 1.0。

### 3.2 原始评测脚本

```python
from ragas import evaluate
from ragas.metrics import (faithfulness, answer_relevancy,
                           context_precision, context_recall, answer_correctness)
from ragas.llms import LangchainLLMWrapper
from ragas.embeddings import LangchainEmbeddingsWrapper
from langchain_openai import ChatOpenAI
from langchain_community.embeddings import HuggingFaceEmbeddings
from datasets import Dataset

api_key = os.getenv("OPENAI_API_KEY")
base_url = os.getenv("OPENAI_BASE_URL", "https://tokenhub.tencentmaas.com/v1")
model = os.getenv("RAGAS_MODEL", "deepseek-v4-pro")

llm = LangchainLLMWrapper(langchain_llm=ChatOpenAI(
    model=model, api_key=api_key, base_url=base_url, temperature=0))

embeddings = LangchainEmbeddingsWrapper(HuggingFaceEmbeddings(
    model_name="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"))

dataset = Dataset.from_dict(eval_dataset)

result = evaluate(
    dataset=dataset,
    metrics=[context_precision, context_recall, faithfulness,
             answer_relevancy, answer_correctness],
    llm=llm,
    embeddings=embeddings,
)
print(result)   # 原始版只打印这个——输出的是逐指标均值，不是逐条
```

### 3.3 第一阶段结果：均值视角下，一切正常

`print(result)` 输出逐列均值（RAGAS `__repr__` 对每列做 `safe_nanmean`，忽略 null/NaN）：

```
faithfulness:           0.5840
context_recall:         1.0000
answer_correctness:     0.9360
answer_relevancy:       1.0000
context_precision:      1.0000
```

faithfulness≈0.58，五项指标里头三项几乎满分。这份输出放在任何团队面前，都会被判为"系统整体健康，faithfulness 稍低但可接受"——这正是均值最危险的地方。

假设某指标在 5 个样本里 4 个接近 1.0、1 个是 0.0，均值 = (4×1.0 + 0.0)/5 = 0.8，看起来"还凑合"，那唯一一个 0.0 在均值里几乎消失。Faithfulness 又是"脆弱比值"——单条 claim 被 judge 错判，就能让某个样本分数直接减半甚至归零。它恰恰是最容易出现单点失效的指标，而它在均值里最容易被藏住。

### 3.4 第二阶段结果：改看逐条，问题才浮出水面

在脚本里加了 `df.to_json(orient="records")` 展开逐条明细（也可用 `result.to_pandas()` 逐行迭代）。数值为首次运行的**真实结果**：

| 样本       | faithfulness | context_recall | answer_correctness | answer_relevancy | context_precision |
| ------------------- | ------------ | -------------- | ------------------ | ---------------- | ----------------- |
| 爱因斯坦诺奖   | **0.0**      | 1.0            | 1.0                | 1.0              | 1.0               |
| 光合作用     | **0.5**      | 1.0            | 0.83               | 1.0              | 1.0               |
| 列表 vs 元组 | **0.67**     | 1.0            | 0.95               | 1.0              | 1.0               |
| 过拟合      | **0.75**     | 1.0            | 0.9                | 1.0              | 1.0               |
| 水化学式     | **1.0**      | 1.0            | 1.0                | 1.0              | 1.0               |

均值视角下"还凑合"的 0.58，逐条一看，立刻显出一条 **0.0**——爱因斯坦样本被判定为"答案完全无依据"。而其余四项指标均处于健康区间，唯独 faithfulness 出现 0.0 → 0.5 → 0.67 → 0.75 → 1.0 的断裂分布。这种结构性不一致，只在逐条视角下才暴露。

### 3.5 交叉校验：分数与事实矛盾

先做最简单的验证——用肉眼比对"上下文白纸黑字写了什么"和"faithfulness 判了什么"。

爱因斯坦样本的 `contexts[0]` 明确写着：

> *"阿尔伯特·爱因斯坦因对理论物理的贡献，特别是光电效应定律的发现，获得1921年诺贝尔物理学奖。"*

其 `answer[0]` 为：

> *"爱因斯坦因光电效应的理论解释获得1921年诺贝尔物理学奖。"*

二者在事实上完全吻合——"光电效应定律的发现"与"光电效应的理论解释"是同一件事的两种表述，context 第三条"用光子假说成功解释了这一现象"进一步坐实。按定义，这条样本理应是满分 1.0。评测却给了 0.0。

进一步看：在不同时刻对同一个脚本（数据不变、模型不变、temperature=0 不变）多次运行，爱因斯坦样本在另一次运行中变为 **1.0**，光合作用样本在 **0.5 ↔ 0.0** 之间浮动。被测对象是固定的，它的"忠实度"不该随运行改变。两次结果不一致，至少其中一次不可信——异常源于评测过程本身。

### 3.6 打开黑盒：继承 Faithfulness 插桩

![Faithfulness 内部机制](/assets/img/faithfulness-mechanism.png)

Faithfulness 的两阶段流水线见上图：先 `_create_statements` 抽原子 claims，再 `_create_verdicts` 逐条判 verdict（=1/0），分数 = verdict=1 的 claim 数 / claim 总数。

最干净的办法是继承 Faithfulness 类，在内部钩子里打印。注意 `ragas.metrics.faithfulness` 暴露的是已实例化的对象，须先 `type(faithfulness)` 取其类型才能继承；两个覆写方法必须严格保留 `(self, row, statements, callbacks)` 签名并 `await super()`——Ragas 内部以 `_create_verdicts(row, statements, callbacks)` 调用，漏掉 `statements` 会让整列 faithfulness 变 null。本文用到的评测脚本（含此插桩类与 4.2 的三场景验证）可在 [ragas\_demo](https://github.com/rawqing/ragas_demo) 获取：

```python
from ragas.metrics import faithfulness

FaithfulnessBase = type(faithfulness)

class DebugFaithfulness(FaithfulnessBase):
    async def _create_statements(self, row, callbacks):
        print(f"\n🔎 Faithfulness 中间产物 — 问题: {row.get('user_input', '')}")
        out = await super()._create_statements(row, callbacks)
        stmts = out.statements
        print(f"  📝 抽出的 claims（共 {len(stmts)} 条）:")
        for s in stmts:
            print(f"     - {s}")
        return out

    async def _create_verdicts(self, row, statements, callbacks):
        out = await super()._create_verdicts(row, statements, callbacks)
        print(f"  ⚖️  逐条 verdict（共 {len(out.statements)} 条）:")
        for v in out.statements:
            mark = "✅有依据" if v.verdict == 1 else "❌无依据"
            print(f"     [{mark}] {v.statement}")
            print(f"          理由: {v.reason}")
        return out

debug_faith = DebugFaithfulness()
```

在 metrics 中用 `debug_faith` 替代原 `faithfulness` 后重跑。

### 3.7 插桩日志（真实运行，关键样本摘录）

**爱因斯坦诺奖（原始 faithfulness=0.0）**

```
🔎 Faithfulness 中间产物 — 问题: 爱因斯坦因什么获得诺贝尔奖？

📝 抽出的 claims（共 1 条）:
     - 爱因斯坦因光电效应的理论解释获得了1921年诺贝尔物理学奖。

⚖️  逐条 verdict（共 1 条）:
     [✅有依据] 爱因斯坦因光电效应的理论解释获得了1921年诺贝尔物理学奖。
          理由: 上下文明确提到爱因斯坦因光电效应定律的发现获得诺贝尔奖，并进一步说明他用光子假说成功解释了光电效应，因此可以直接推断。
```

claim 抽取准确。**本次 1/1 = 1.0。** 结合首次 0.0 和另一次 1.0——claim 一字未变，verdict 从无依据翻转到有依据。分数的翻转来自 judge 非确定性，而非答案质量。

**光合作用（原始 0.5）**

```
📝 抽出的 claims（共 2 条）:
     - 光合作用的主要产物是葡萄糖（C₆H₁₂O₆）。
     - 光合作用的主要产物是氧气（O₂）。

⚖️  逐条 verdict（共 2 条）:
     [❌无依据] ...理由: The context states that the products are glucose and oxygen,
          but does not specify which is the main product.
     [❌无依据] ...理由: The context indicates that oxygen is one of the products,
          but does not identify it as the main product.
```

context 写了"产物是葡萄糖和氧气"，claim 多了"主要"二字，judge 判无依据。0/2 = 0.0（本次；首次 1/2=0.5）。判定严格但僵化：**字面化判定**。

**列表 vs 元组（原始 0.67）**：6 条 claims，4 条 ✅（可变性相关，context 明确提及），2 条 ❌——"列表使用方括号[]"、"元组使用圆括号()"，context 没提创建语法，judge 不认常识。**过拟合（原始 0.75）**：4 条 claims，3 条 ✅，❌ 是"过度学习噪声和细节"——context 说"模型复杂、参数多、数据少"，没逐字提"噪声"。语义等价的字面化误判。

**水化学式（原始 1.0）**：2/2，干净无争议，说明链路在边界清晰的 case 上工作正常。

### 3.8 实验结论

1. claim 抽取始终准确——抽取不是异常源。
2–3. 同题跨次 verdict 翻转、同义表述被判无依据，根因都在上图 ② 的 judge（非确定性 + 字面化），而非答案质量。

三点全在裁判一侧。答案本身无幻觉，代码无 bug。**Faithfulness 的异常低分指向的不是被测系统，而是裁判模型本身。**

---

## 四、同一个指标，两个方向的失真

Faithfulness 的分数存在双向失真风险。

### 4.1 高分不可信的三种机制

![Faithfulness 高分的三种机制](/assets/img/highscore-three-modes.png)

**真空式高分**最容易被误读成"检索失败所以该给 0"。一个常见的直觉误区是把这个 1.0 改成 0.0：*"答案跟召回内容不相关，Faithfulness 应该是 0"*。这个改法不成立，因为它把**相关性**标准错用到了**忠实度**指标上。*"根据提供的信息无法确定退款周期"* 是一个关于上下文的元陈述——目录树确实不含退款时效，因此这句话与上下文不矛盾、无幻觉，被判为忠实（1/1=1.0）在 RAGAS 的默认 NLI 行为下是正确的（这类「诚实 abstention」答案得高分即文献中的 vacuum high score）。要抓检索失败，靠的是 Context Recall（本例应接近 0，退款政策正文根本没被捞回）与 Context Precision，而不是 Faithfulness。更关键的是：无论这个 case 给 1.0 还是 0.0，Faithfulness 都暴露不了"检索失败"这个真问题——这正是单指标盲区的铁证。

### 4.2 可复现验证：三种失败场景的指标分解

第 4.1 节的三种机制不是思想实验。下面用一份最小可复现评测集把三类"Faithfulness 失真但系统已失败"的场景跑出来，每题都配了 ground_truth 以暴露"答非所问"。评测指标取 `context_precision`、`context_recall`、`faithfulness`、`answer_relevancy`、`answer_correctness` 五项，judge 同样 `temperature=0`；逐条 verdict 打印沿用 3.6 节的 DebugFaithfulness 插桩。完整可运行脚本（含评测数据集定义、插桩类与五项指标评测入口）托管在 [ragas\_demo](https://github.com/rawqing/ragas_demo)，clone 后可直接复现上述双跑结果。

```python
eval_dataset = {
    "question": [
        "退款周期一般是多久？",                  # 场景 A：检索彻底失败，只召回目录树
        "正式员工离职要提前多久申请？",          # 场景 B：错误章节命中
        "年假到底多少天？",                      # 场景 C：过泛复述
    ],
    "answer": [
        "根据提供的信息无法确定退款周期。",      # A：生成器如实说"无法确定"
        "需提前 3 天以书面形式通知。",            # B：忠实于错误章节
        "具体天数按公司制度执行。",              # C：零信息量废话
    ],
    "contexts": [
        [  # A：只有产品手册目录（章节标题 + 页码），无退款时效实质内容
            "《产品手册》目录：第一章 产品概述（p.1） 第二章 退款政策（p.12） "
            "2.1 退款适用情形（p.12） 2.2 退款流程（p.13） 2.3 退款周期（p.14） 第三章 售后服务（p.20）",
            "《产品手册》索引：退款—见第二章（p.12）；退货—见 2.2（p.13）；售后—见第三章（p.20）。",
        ],
        [  # B：召回的是"员工离职"条款，正确条款（30 天）根本没召回
            "《员工手册》第 4.2 节（离职申请）：员工离职需提前 3 天以书面形式通知用人单位，并完成工作交接。",
        ],
        [  # C：上下文只说"按工龄职级提供年假"，完全没给天数
            "公司按工龄和职级为员工提供相应的带薪年假，具体天数依据公司制度确定。",
        ],
    ],
    "ground_truth": [
        "退款周期一般为 7 个工作日，自收到退回商品并验收合格之日起算。",   # A 真实答案
        "正式员工离职需提前 30 天以书面形式通知用人单位。",               # B 真实答案
        "入职满 1 年享 5 天年假，每满 1 年增加 1 天，上限 15 天。",         # C 真实答案
    ],
}
```

同一份代码、同一份数据、同一个 `temperature=0`，连跑两次，Faithfulness 却不是定值——这才是比"高分假象"更尖锐的结论：

| 场景     | Faithfulness(Run 1) | Faithfulness(Run 2) | Context Recall | Answer Correctness | 失败是否被暴露                 |
| ------ | ------------------- | ------------------- | -------------- | ------------------ | ----------------------- |
| A 检索失败 | 1.0                 | **0.0**             | 0.0            | 0.124              | ✅ Recall/Correctness 揭穿 |
| B 错误章节 | 0.0                 | **1.0**             | 0.0            | 0.157              | ✅ Recall/Correctness 揭穿 |
| C 过泛复述 | 1.0                 | 1.0                 | 0.0            | 0.096              | ✅ Recall/Correctness 揭穿 |

A 在两次运行间于 1.0 ↔ 0.0 翻转，B 同样 0.0 ↔ 1.0 翻转（C 保持满分）。三类场景的 `context_recall` 始终为 0.0——检索器一条都没捞回正确答案所需的信息，系统失败是确定的；但 Faithfulness 在两个方向上都随 run 抖动，连"谁是 0、谁是 1"都不可复现。**一个在 `temperature=0` 下仍跨次翻转的指标，已经不是"估计有噪声"的程度问题，而是它本身不构成稳定的诊断信号。**

逐条 verdict 暴露了翻转背后的裁判逻辑。场景 A 在 Run 1 给 1.0 的理由是：

> 所提供的上下文仅为产品手册的目录和索引……并未给出具体的退款周期时长或具体内容。因此，仅凭此上下文无法确定退款周期，该陈述可直接推断。

Run 2 同一条 claim 却给 0.0，理由变成：

> 上下文明确提到了"2.3 退款周期（p.14）"，这表明手册中包含了退款周期的内容，因此可以根据提供的信息确定退款周期的存在和相关位置。

两次理由针锋相对，且 Run 2 的理由本身是个误判——目录只说明"退款周期"在第 14 页有讨论，并未给出任何周期长度，"能确定其存在"绝不等于"能确定退款周期"。场景 B 在 Run 2 给 1.0 的理由则是：

> The context states that employees (员工) must give 3 days' written notice… '正式员工' (regular employees) are a subset of employees, so the requirement directly applies to them.

judge 用"子集包含"把错误章节当成了正确答案背书——而真实答案（正式员工提前 30 天）根本没被召回。

三个场景真正的共同失败信号始终是 `context_recall = 0.0`：它在两次运行中纹丝不动，稳定地揭穿了三者的检索失败；Faithfulness 却随 run 在 0 与 1 之间跳变，无论落到哪一侧都读不出"检索失败"这个真问题。**单看 Faithfulness，你连"这次该信几分"都无法回答；是 Context Recall 的 0.0 一致地守住了诊断底线。**

（顺带一说，场景 C 的 Context Precision 也从 Run 1 的 0.0 翻到 Run 2 的 ≈1.0，说明 LLM-as-a-Judge 的非确定性不止感染 Faithfulness 一个指标；但 Context Recall 这个由检索覆盖度定义的信号不受影响，正是它可靠。）

### 4.3 低分不可信：裁判的噪声

爱因斯坦 0.0 的案例已经坐实，4.2 的三场景双跑把它从个例上升为规律：A、B 在 `temperature=0` 下仍于 0.0 ↔ 1.0 翻转，说明非确定性不是偶发，而是 judge 的常态。一个刺眼的低分（或反常的高分），可能只是 judge 当次的误判，而非答案的幻觉。

面对一个 faithfulness 分数，正确的反问不是"够不够高"，而是三句：上下文检索对了吗？答案有信息量吗？看的是逐条还是均值，judge 跑了多少次？

---

## 五、先修裁判，再修架构

异常根因在 judge（非确定性 + 字面化），RAGAS 指标设计层是次要因素（faithfulness 是脆弱比值 + 两阶段误差，单条 claim 错判就能让分数直接减半）。但这两层都不是 RAGAS 独有——非确定性、字面化、位置偏置、长度偏置，是 LLM-as-a-Judge 范式的共性上限。**换工具往往只是换一批 quirks，核心原则是：先调 judge、调评测方法，而非换框架。**

按杠杆从高到低：

**1. 锁死 judge 随机性——最便宜，必要但不充分。** `temperature=0`。4.2 的双跑已证明即使锁温度仍跨次浮动（A、B 在 0.0↔1.0 间翻转），所以不能单独依赖，须跟下一条配合。

**2. 把分数当"带误差条的估计"，多次跑取均值。** 跑 3–5 次取均值并报告方差（±std）。一个 0.0 可能是噪声；均值 0.7±0.2 才有信息量。API 调用成本线性上升 3–5×，但投入产出比最高，应默认开启。

**3. 升级/更换 judge 模型，而非评测工具。** 更强的前沿模型通常更校准、跨次更稳定。关键约束：**生成和评测绝不能同家族**——生成用 GPT-4o，裁判至少换 Claude 这类不同家族，才能压低自我增强偏差。

**4. 定制 NLI 提示，直接治字面化。** 覆写 `faithfulness.nli_statements_prompt`，把"语义等价即视为有依据"写进裁判规则，可缓解 2.3 中"产物≠生成物"这类字面化误判。`evaluate()` 没有 prompt 参数，需直接修改指标对象属性。

---

## 六、评测数据集：地基决定上限

Golden Dataset 是评测可信度的前置条件。

**数据从哪来？** 三种来源配比是经过验证的经验值：生产日志采样 50%（真实分布，覆盖长尾，但需脱敏），人工构造 20%（精准覆盖边界 case，成本最高），合成数据 30%（量大可批量，但有陷阱）。生产日志最被低估——RAG 上线后用户实际问了什么、哪些回答引发了"无用"反馈，把这些真实 case 梳理进评测集，效果远好于纯合成。

**合成数据的三个陷阱。** 一是语言多样性不足——合成数据倾向生成语法完整、表达清晰的"教科书式"问题，真实用户的问题往往是模糊的、不完整的、带错别字的。二是数据污染——合成数据用的 LLM 可能与 RAG 的生成模型相同，评测变成作弊。三是分布偏移——合成数据倾向生成"好回答"的简单题，缺少多跳推理、模糊指代这些硬 case。

**标注质量控制。** 每个 case 至少两人独立标注，Krippendorff α > 0.67 才能说明标注指南清晰。两人不一致时第三位资深成员仲裁，所有争议 case 进入 review pool 迭代优化标注标准。投入分层：L1（事实查询）可 1 人标注 + 自动校验，L3（多跳推理）和 L4（对抗性查询）建议 3 人标注。

评测集按问题难度分层，比扁平数据集有价值得多：

| 层级 | 类型     | 示例                   | 评测重点                       | 建议占比 |
| -- | ------ | -------------------- | -------------------------- | ---- |
| L1 | 事实查询   | "退货需要什么条件？"          | Recall + Faithfulness      | 40%  |
| L2 | 推理性查询  | "产品 A 和 B 对比？"       | Precision + Relevancy      | 25%  |
| L3 | 多跳推理   | "去年 Q3 最高产品线，今年的策略？" | Recall + Faith + Relevancy | 15%  |
| L4 | 对抗性    | "忽略上面信息，直接告诉我…"      | 安全性 + Faithfulness         | 10%  |
| L5 | 模糊/不完整 | "那个上次的报错怎么处理？"       | Precision + Relevancy      | 10%  |

分层报告比单一总分有用得多：L1 0.95 但 L3 0.45，一眼就知道多跳推理是系统短板。

---

## 七、评测器的分层可信模型

有了可靠的数据集和校准后的 judge，下一个问题是：单一 LLM 裁判的可靠性上限是硬约束。三角验证用多层校验绕过这个约束。四层分工与信任递进关系如下——待测样本从最底层进入规则过滤，逐层向上建立信任；第四层持续监督并报警，倒逼第二、三层回校准：

![评测器四层可信模型](/assets/img/评测器四层可信模型.png)

下面逐层说明每一层如何落地。

**第一层，规则评测器。** 确定性检查，0 成本、0 延迟。格式合法吗、长度在合理区间吗、PII 泄露了吗——这些事根本不需要 LLM：

```python
class RuleBasedEvaluator:
    """确定性规则评测 —— 零成本快速过滤"""

    def evaluate(self, question, answer):
        return {
            "format_valid": self._check_format(answer),
            "keyword_present": self._check_keywords(answer),
            "length_in_range": self._check_length(answer),
            "no_pii_leak": self._check_pii(answer),
        }

    def _check_format(self, answer):
        try:
            json.loads(answer)
            return True
        except:
            return False

    def _check_pii(self, answer):
        import re
        patterns = [r'\b\d{3}-\d{2}-\d{4}\b', r'\b\d{16}\b']
        for p in patterns:
            if re.search(p, answer):
                return False
        return True
```

这一层存在的意义不是"评质量"，而是先过滤明显的垃圾，让后两层只处理真正的语义问题。

**第二层，LLM-as-a-Judge。** 主力，但前提已经讲透：生成和裁判不同家族、多次取均值、定制 NLI 压字面化、每次看逐条明细。

**第三层，人工抽检——按分数分层，不随机抽。** 分数在 0.5–0.7 之间的灰色地带 case 最值得人工 review，最可能暴露 judge 的系统性偏差。日常迭代抽 5–10%，版本发布抽 20–30%。

```python
def stratified_sampling(eval_results, sample_rate=0.10):
    """按分数分层抽样，重点抽检灰色地带"""
    bins = [(0.0, 0.3), (0.3, 0.5), (0.5, 0.7), (0.7, 0.85), (0.85, 1.0)]
    weights = [0.05, 0.10, 0.40, 0.30, 0.15]  # 灰色地带权重最高
    sampled = []
    for (low, high), weight in zip(bins, weights):
        in_bin = [r for r in eval_results if low <= r["score"] < high]
        n_sample = max(1, int(len(in_bin) * sample_rate * weight * 5))
        sampled.extend(random.sample(in_bin, min(n_sample, len(in_bin))))
    return sampled
```

**第四层，元评估。** 持续追踪 judge vs 人工一致性。一旦 κ 从 0.8 掉到 0.6，自动报警——judge 漂移或数据分布变了，"judge 本身可观测"才是信任的前提。

---

## 八、评测 Pipeline 工程化

评测的手工运行和自动化流水线之间有一个关键差距：前者靠人工纪律保证一致性，后者靠工具保证可复现。

**缓存层。** RAGAS 四指标每条数据各自要调多次 LLM，调用次数分布如下；100 条数据跑全套四指标可能触发上千次 API 调用：

![RAGAS 各指标的单条数据 LLM 调用次数](/assets/img/metric-llm-calls.png)

加缓存后，相同评测配置与上下文的结果直接复用：

```python
class EvaluationCache:
    def __init__(self, cache_dir="./.eval_cache"):
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(exist_ok=True)

    def _cache_key(self, metric, question, context, answer):
        content = json.dumps({
            "metric": metric, "question": question,
            "context": context, "answer": answer,
        }, sort_keys=True)
        return hashlib.sha256(content.encode()).hexdigest()

    def get(self, metric, question, context, answer):
        key = self._cache_key(metric, question, context, answer)
        cache_file = self.cache_dir / f"{key}.json"
        if cache_file.exists():
            return json.loads(cache_file.read_text())
        return None

    def set(self, metric, question, context, answer, result):
        key = self._cache_key(metric, question, context, answer)
        (self.cache_dir / f"{key}.json").write_text(json.dumps(result))
```

**增量评测。** 不是每次改动都跑全量。换 embedding 模型 → 跑检索维度（Precision + Recall）；改 prompt → 跑生成维度（Faithfulness + Relevancy）；改 chunk_size → 优先跑 L3（多跳推理），因为 chunking 对多跳影响最大。

**CI/CD 门禁。** 每次 PR 自动对比基线，退化超阈值则阻断。注意门禁阈值必须留足 buffer（如 5% 而非 1%），因为分数本身可能受 judge 噪声干扰——阻断时附上逐条明细，让人快速判断是"真退化"还是"judge 抽风"：

```python
def eval_gate(current_scores, baseline_scores, thresholds):
    failures = []
    for metric, current in current_scores.items():
        baseline = baseline_scores.get(metric, current)
        degradation = baseline - current
        threshold = thresholds.get(metric, 0.05)

        if degradation > threshold:
            failures.append({
                "metric": metric, "baseline": baseline,
                "current": current, "degradation": degradation,
                "threshold": threshold,
            })

    return {
        "pass": len(failures) == 0,
        "failures": failures,
        "summary": f"{len(failures)}/{len(current_scores)} metrics degraded",
    }
```

---

## 九、已知局限与方法边界

这套方法存在几项结构性局限，明确标识它们比给出完美承诺更有工程价值。

**Golden Dataset 的代表性上限。** 评测集无法完全覆盖真实用户查询的分布。生产监控和离线评测必须互补。

**LLM-as-a-Judge 的一致性上限。** 爱因斯坦样本跨次翻转（0.0 ↔ 1.0）已用实验证明：即便是温度锁死、数据不变、代码不变的同一套评测，单次分数的可信度也必须打折。高风险场景（合规审核、医疗建议），自动化评测只是辅助。

**多跳推理评测的不成熟。** 现有主流框架对多跳推理的评测普遍不够可靠。Claim 拆分可能在推理链中间断裂——原本需要"检索 A→推理 B→检索 C→推理 D"才能到达的答案，被 Judge 按单跳逻辑误判。

**数据新鲜度的持续盲区。** 没有任何自动化指标能告诉你"检索到的内容是否已经过时了"。Faithfulness 满分，可能只是忠实地复述了一段早已过时的文档——指标没说谎，但它无从知道内容是否还符合现实。这是数据治理与评测联动才能解决的系统性问题。

还有一个 RAGAS 标准四维度之外的维度值得单独提——**Context Trustworthiness**（检索索引本身的可靠性），它是真实业务里最容易被忽略的断路器。

---

## 十、写在最后

一个极度优秀的指标表现，可能对应一套健康的 RAG 系统，也可能对应一次被完美掩盖的检索失败。当评测的每一步都靠手工纪律维系时，你不知道自己拿到的是哪一类。

不要把 RAGAS 的分数当成结论，只把它当作待校验的原始信号。看逐条、跑均值、锁裁判、修提示、建数据集、做人工校准、设门禁、诚实面对边界——这些做法合在一起，才构成评测的工程化。一个孤立的分数本身不说明任何问题；让它真正变得可信的，不是某个更好的指标，而是更完整的验证链。

本文限于篇幅仅着重对 `faithfulness` 指标做出了详细分析，其他指标的分析与评测方法类似，诸君可自行探索。

---

## 附录：可运行脚本与复现指引

本文涉及的完整可运行脚本（含评测数据集定义、插桩类 `DebugFaithfulness` 与五项指标评测入口）已托管在 [`ragas_demo`](https://github.com/rawqing/ragas_demo)。

clone 后即可直接复现文中的关键实验，无需手动拼装代码：

- **逐条明细插桩**：对应第三·六节（§3.6）的 `DebugFaithfulness` 类，继承 `Faithfulness` 在 `_create_statements` / `_create_verdicts` 内部钩子打印中间产物与逐条 verdict。
- **三种失败场景双跑**：对应第四·二节（§4.2）的最小可复现评测集（场景 A 检索失败 / B 错误章节 / C 过泛复述），连跑两次观察 Faithfulness 在 0.0 ↔ 1.0 之间翻转，而 `context_recall` 始终为 0.0 稳定揭穿检索失败。
- **五项指标评测入口**：`context_precision`、`context_recall`、`faithfulness`、`answer_relevancy`、`answer_correctness` 一次性跑全。

复现建议：环境 `ragas==0.2.15`，judge 模型走 OpenAI 兼容网关，全程 `temperature=0`；对同一份脚本、同一份数据连跑两次，对照正文表格核验 Faithfulness 的跨次翻转与 `context_recall` 的一致性。
