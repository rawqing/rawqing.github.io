---
layout: post
title: 'TestNG 参数化进阶'
subtitle: '更加实用的参数化方法'
date: 2018-12-08
author: 雨落寒霜
tags: testng 参数化 params 
---
> TestNG 是一款强大的单元测试框架 , 但是其参数化的方式还是不够友好. 以此
框架来强大我们的测试吧.  

项目地址: [https://github.com/rawqing/TestngParams](
https://github.com/rawqing/TestngParams )    

### 快速开始

#### 安装  
##### 使用 maven  
 1. 添加依赖  
    ```xml
    <dependency>
      <groupId>io.github.rawqing</groupId>
      <artifactId>TestngParams</artifactId>
      <version>2.2</version>
    </dependency>
    ```  
    
##### 使用 gradle  
 1. 添加依赖  
    ```groovy
    testCompile 'io.github.rawqing:TestngParams:2.2'
    ```   
    
#### 添加监听   
为 TestNG 测试框架提供简洁的参数化方式 , 共有如下几种:  
注: 所有方式均需使用监听   
`@Listeners(yq.test.tesgngParams.feature.listener.ParamsListener.class)`  
当然也可以将监听配置在 `testng.xml` 文件中  
```xml
<listeners>
    <listener class-name="yq.test.tesgngParams.feature.listener.ParamsListener"/>
</listeners>
```  
不过若想在调试中使用 , 还是使用注解的方式比较好.

#### Params
最简单的一种, 直接使用 `@Params` 注解,并传入 `String` 类型的数组
即可完成参数化  
```java
@Test
@Params({
        "jone ,8",
        "  wang, 19"
})
public void params_case01(String name, int age) {
    System.out.println(String.format("~params_case01 : my name is %s , %d years old .",name ,age));
}
```  
注: 一个字符串对应一组参数 , 使用","(逗号)分隔 , 并忽略前后空白;

#### YamlParameter
使用 `yml` 文件的方式参数化 , 适用多参数/从不同环境取值等复杂的参数化需求.
使用方式分为两种:
 1. 单独使用  
    使用 `@YamlParameter` 注解并传入 yml 文件的相对路径(`resources` 目录下的路径)
    ```java
    @Test
    @YamlParameter("testdata/yml01.yml")
    public void yml_case01(boolean print ,String s) {
        if (print) {
            System.out.println(s);
        }else{
            System.out.println(s);
        }
    }
    ```  
    yml 文件内容的定义方式, 将在后文讲述.  
    
 1. 指定当前 test class 的全局文件
    使用 class 注解 `@YamlFilePath` 来指定 yml 文件路径 , 然后 `@YamlParameter` 就使用无参的.
    ```java
    @YamlFilePath(("testdata/yml01.yml"))
    @Listeners(ParamsListener.class)
    public class YmlParamTest03 {
    
        @Test
        @YamlParameter
        public void yml_case01(String name, int age) {
            System.out.println(String.format("my name is %s , %d years old .",name ,age));
        }
    }
    ```    
    
#### 自定义的参数化方式    
可以自定义注解和实现方式去实现自己的参数化方法 , 有想法就去实现吧,少年~  
 1. 创建自定义注解, 并使用注解 `@CustomParameter` 指定实现类
    ```java
    @Retention(RetentionPolicy.RUNTIME)
    @CustomParameter(provider = MyParamsImp.class)
    public @interface MyParams {
    
        String value() default "";
    }
    ```  
 1. 创建实现类 , 并实现 `IParametersProvider` 接口  
    ```java
    public class MyParamsImp implements IParametersProvider<MyParams> {
        private MyParams c;
        @Override
        public void initialize(MyParams parametersAnnotation) {
            c = parametersAnnotation;
        }
    
        @Override
        public Object[][] getParameters(ITestContext context, Method method) {
            YamlProviderImp yamlProviderImp = new YamlProviderImp("testdata/" ,c.value());
            return yamlProviderImp.getParameters(context, method);
        }
    }
    ```  
    
#### 使用 hook  
有些时候简单的参数化已经不能满足需求 , 我们将使用 hook 来解决这个问题.  
 1. 处理对象映射  
    当前使用 `$` 符号做对象映射符  
    配置 : 需要在 `resources` 根目录下的配置文件
    ( mapping.yml || config.properties 优先使用 mapping.yml )中配置  
    mapping.yml:  
    `$: yq.test.tesgngParams.cases.hooksTest.TheVar`  
    config.properties:  
    `$=yq.test.tesgngParams.cases.hooksTest.TheVar`  
 1. 功能提供类  
    ```java
    public class TheVar {
    
        public String name = "zhangsan";
        public int age = 19;
    
    
        public String getTime() {
            return String.valueOf(new Date().getTime());
        }
    
        public String getTime(String date) {
            long simpleTime = DoIt.getSimpleTime("yyyy-MM-dd HH:mm:ss", date);
            return String.valueOf(simpleTime);
        }
        public String toUp(String string){
            return string.toUpperCase();
        }
    }
 
    ```  
    注: 该类的全类名必须对应映射配置的全类名  
 1. 使用成员变量
    使用 `$成员变量名称` 获得 , 如 `$name == "zhangsan"`  
    
 1. 使用方法
    使用 `${$.方法名(参数1,参数2)}` 获得. 如:  
    `${$.getTime()}  == 当前时间毫秒数的字符串`   
    `${$.getTime(\"2018-11-12 09:12:12\")}  == 指定时间毫秒数的字符串` 

 1. 字符串模板  
    在限定符 \` \` 之间的字符串将被解释拼接 , 类似 groovy , kotlin 的功能  
    ``` "`my name is ${$.toUp( $name)} , $age years old.\`" ```  
    output: my name is ZHANGSAN , 19 years old.  
    
 1. 使用语句  
    单条语句:  
    `"${new Date().getTime()}"  == 当前时间毫秒数, long 类型`  
    多条语句:  
    `"${x = 2; b=3; x*b}"  == 6`  
    
 1. 成员变量单独使用  
    不支持单独使用变量 , 单独使用将原样输出 `$name == $name String 类型`  
    有两种方式单独获得变量值 :   
    ``` "`$age`" == 19 String 类型```  
    `${$age} == 19 int 类型`   
 1. 自定义对象映射 (2.2版本添加)
    可以不局限于使用 `$` 来映射变量, 且可以同时使用多个映射,混合使用.  
    映射 key 的命名同 java 变量命名规则 : 下划线或小写字母开头(不支持大写字母开头)  
    方法调用同 `$`   
    属性调用则同于 groovy/kotlin 的形式 . `private` 限制的属性必须要有 `public` 修饰的 `get` 方法
    否则将无法调用.
        
### yml 参数文件结构  
从 2.0 版本开始分成了两个版本 : V1 继续支持旧版(默认) , V2 则使用新版的数据结构  

#### V1  
```yaml
# 具体的yaml/ yml文件的格式请参考官方文档 ,这里只做简单介绍
# 1. 文件中的缩进一定要注意 , 类似于Python , 靠缩进来判断语义
# 2. 本文中的 class , method ,name ,data 为内定的关键字 , 其使用格式如下文
#   2.1 class: test class 的类名( 简单类名 , 非全类名)
#   2.2 method: 测试类下的方法 (包含名称 和 数据两部分 , 是一个 list : List<Map<String,Object>> )
#   2.3 name: 测试类下的测试方法名
#   2.4 data: 测试方法的参数 ( 注意参数个数必须一致 , 类型也需一致.
#             目前支持[int,float,double,long,String,boolean,BigDecimal,enum]
#   2.5 data 是 List
# 3. document的开始以 "---" 分割
class: YmlParamTest
method:
  - name: yml_case01
    data:
      - ["zhangsan" ,18]
      - ["lisi",20]

  - name: yml_case02
    data:
      - "hello"
      - 你好

---
class: YmlParamTest02
method:
  - name: yml_case01
    data:
      - [true, 天气不错]
      - [false ,hello]
```  

#### V2   
直接使用 class name 和 method name 作为 key  
```yaml
# test class NewYmlTest01
NewYmlTest01:
  # test function yml_case1_1
  yml_case1_1:
    - [zhangsan ,21]
    - [lisi ,19]
  yml_case1_2:
    - "hello"
    
NewYmlTest02:
  yml_case2_1:
    - [wangwu ,90]
  yml_case2_2:
    - "hi"
```
