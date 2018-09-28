---
layout: post
title: '基于Espresso的Android UI自动化框架设计之四'
subtitle: '参数化 -- 可重复使用的测试方法'
date: 2018-09-22
author: 雨落寒霜
tags: espresso Android UI自动化 参数化
---
> 为什么仅用参数化,而不是数据驱动?  

本系列项目位于`github:` [https://github.com/rawqing/EspressoBlackBoxDemo](https://github.com/rawqing/EspressoBlackBoxDemo)

### 一、参数化 VS 数据驱动  
我们现来看两个概念:  
**参数化:** 参数化测试可以使用不同的参数多次运行测试.  
**数据驱动:** 任何有可能改变的东西（也称为“可变性”，包括环境，终点，
测试数据，位置等元素）都会从测试逻辑（脚本）中分离出来并转移到“外部资产”中。
这可以是配置或测试数据集。脚本中执行的逻辑由数据值决定。
与关键字驱动的测试类似，只是测试用例包含在数据值集中，
而不是在测试脚本本身中嵌入或“硬编码”。
该脚本只是数据源中保存的数据的“驱动程序”（或传递机制）.  
从概念上看，数据驱动是参数化的"升级版"，数据驱动是将所有的变量剥离，并以此来驱动
测试脚本，其口号是"让不会写代码的测试人员也可以写自动化测试用例！" 当然，
我也认为这只是一个泡影。变量越多设计越复杂，so，一个灵活的参数化就足够解决问题了。  

### 二、参数化工具  
`AndroidJunit4` 的参数化也是基于 `Junit4` 的。使用Junit4 `Parameterized` 做过参数化的都知道，这个工具并不那么好用。  
这里推荐使用 [基于Espresso的Android UI自动化框架设计之二](/2018/06/23/concept_design.html) 中提到过的开源工具
[JUnitParams](http://pragmatists.github.io/JUnitParams/) 它提供了更加丰富的、可扩展的
参数化解决方案。 
### 三、基础参数化  
1. 配置  
    在 `dependencies` 中加入
    ```groovy
    androidTestImplementation 'pl.pragmatists:JUnitParams:1.1.1'
    ```
2. 使用  
    我们将之前的测试代码改装一下  
    ```java
    package yq.test.espressoblackboxdemo.tests
    
    import junitparams.JUnitParamsRunner
    import junitparams.Parameters
    import org.junit.Rule
    import org.junit.Test
    import org.junit.runner.RunWith
    import yq.test.espressoblackboxdemo.utils.UtilJ
    import yq.test.espressoblackboxdemo.views.LoginView
    
    @RunWith(JUnitParamsRunner::class)
    class LoginParameterizedTest {
    
        @get:Rule
        var atr = UtilJ.getActivityTestRule("yq.test.logindemo.LoginActivity")
    
    
        @Test
        @Parameters(
                "hello , ,This email address is invalid",
                "foo@example.com ,1, This password is too short"
        )
        fun testLogin(username: String, pwd: String ,toastMsg: String){
            val login = LoginView()
            login
                    .doLogin(username ,pwd)
                    .checkLoginError(toastMsg ,atr)
        }
    }
    ```
    变更1：`@RunWith(JUnitParamsRunner::class)` 需要将原来的 `AndroidJUnit4` 变更为`JUnitParamsRunner`  
    变更2：加入`@Parameters`并按规则写入参数数据  
    变更3：将无参的测试方法变更为有参的，并且需要与`@Parameters`中定义的数量一致  
    变更4：将原来代码中'硬编码'的数据替换成形参名  
 1. 测试结果   
    ![](/screenshot/espresso/ui04/testRes0.jpg)
如此一个简单的参数化算是完成了。

### 四、进阶参数化  
虽然该工具自带了些使用文件参数化的方案，不过这里我们来讲讲对它的扩展（使用`Yaml / Yml`文件来参数化）  
 1. 新建包和`Class`文件（直接图说）  
    ![文件目录](/screenshot/espresso/ui04/paramsFile.jpg)  
 1. 具体实现  
    `YmlParameters.kt`用于在测试方法上使用的注解，用来指定该方法使用的数据文件路径：  
    ```java
    package yq.test.espressoblackboxdemo.parameters
    
    import junitparams.custom.CustomParameters
    import yq.test.espressoblackboxdemo.parameters.provider.YmlParametersProvider
    
    @Retention(AnnotationRetention.RUNTIME)
    @CustomParameters(provider = YmlParametersProvider::class)
    annotation class YmlParameters (val value: String = "")
    ```  
    
    `YmlFilePath.kt` 用于定义整个测试类所共用的测试数据文件路径：  
    ```java
    package yq.test.espressoblackboxdemo.parameters
    
    @Target(AnnotationTarget.CLASS, AnnotationTarget.FILE)
    @Retention(AnnotationRetention.RUNTIME)
    annotation class YmlFilePath (val value: String)
    ```
    
    `YmlParametersProvider.kt` 上述两个注解的实现供给者，也是关键之所在：  
    ```java
    package yq.test.espressoblackboxdemo.parameters.provider
    
    import android.support.test.InstrumentationRegistry
    import android.util.Log
    import com.esotericsoftware.yamlbeans.YamlReader
    import junitparams.custom.ParametersProvider
    import org.junit.runners.model.FrameworkMethod
    import yq.test.espressoblackboxdemo.parameters.YmlFilePath
    import yq.test.espressoblackboxdemo.parameters.YmlParameters
    import java.io.File
    import java.io.IOException
    import java.io.InputStream
    import java.io.InputStreamReader
    import java.math.BigDecimal
    import java.util.ArrayList
    
    class YmlParametersProvider: ParametersProvider<YmlParameters> {
        private var ymlParameters: YmlParameters? = null
        private var parameterTypes: Array<Class<*>>? = null
        private var testClass: Class<*>? = null
        private var testMethodName: String? = null
        private var testClassName: String? = null
        private val class_key = "class"
        private val method_key = "method"
        private val TAG = "YmlParametersProvider"
        private val test_data_root_dir = "test_data"
    
    
        override fun getParameters(): Array<Any> {
            val params = getMethodParams() ?: throw RuntimeException("Empty parameters .")
            val res = ArrayList<Any>()
            params.forEach {
                var data: MutableList<*>? = null
                // 将每行数据封装成 List
                data = if (it is List<*>){
                    it as MutableList<*>
                }else{
                    mutableListOf(it)
                }
                res.add(createParams(data, this.parameterTypes!!))
            }
    
            return res.toArray()
        }
    
        override fun initialize(parametersAnnotation: YmlParameters, frameworkMethod: FrameworkMethod) {
            this.ymlParameters = parametersAnnotation
            this.parameterTypes = frameworkMethod.method.parameterTypes
            this.testMethodName = frameworkMethod.name
    
            val declaringClass = frameworkMethod.declaringClass
            this.testClass = declaringClass
            this.testClassName = declaringClass.simpleName
        }
    
        /**
         * 获取当前方法在 yml 文件中定义的参数
         * @return
         */
        private fun getMethodParams(): List<*>? {
            val yamlObject = this.getYamlObject(ymlParameters!!.value)
                    ?: throw RuntimeException("Empty parameters .")
            val datas = yamlObject as List<*>
            for (o in datas) {
                val map = o as Map<*, *>
                if (testMethodName == map["name"]) {
                    return map["data"] as List<*>
                }
            }
            return null
        }
    
        /**
         * 捕获 yml 文档中当前 test class 的所有 method 的数据
         * 每个文档必须包含 "class" , "method" 这两个key
         * @param ymlFilePath
         * @return method 这个 key 的value
         * 一般为 ArrayList
         */
        private fun getYamlObject(filePath: String): Any? {
            var ymlFilePath = filePath
            if ("" == ymlFilePath) {
                ymlFilePath = this.testClass!!.getAnnotation(YmlFilePath::class.java).value
    
            }
            val path = test_data_root_dir + File.separator + ymlFilePath
            val list = readYamlFile(path)
            for (obj in list!!) {
                val map = obj as Map<*, *>
                val aClass = map[class_key]
                if (testClassName == aClass) {
                    return map[method_key]
                }
            }
            return null
        }
    
        /**
         * 创建参数
         * @param datas
         * @param types
         * @return
         */
        fun createParams(datas: List<*>, types: Array<Class<*>>): Array<Any?> {
            val dataSize = datas.size
            val typeLen = types.size
            // 判断参数个数与参数类型个数是否一致
            if (dataSize != typeLen) {
                throw RuntimeException("参数个数($dataSize)与参数类型个数($typeLen)不匹配")
            }
    
            val o = arrayOfNulls<Any>(typeLen)
            for (i in 0 until typeLen) {
                val data = datas[i]
                o[i] = castObject(types[i], data!!)
            }
            return o
        }
    
        /**
         * 读取 Assets 资源中的 yml 文件
         * @param `in`
         * @return Object 对象
         */
        fun readYamlFile(input: InputStream): List<*> {
            val list = ArrayList<Any>()
            try {
                val reader = YamlReader(InputStreamReader(input))
                while (true) {
                    val contact = reader.read() ?: break
                    list.add(contact)
                }
            } catch (e: IOException) {
                e.printStackTrace()
                Log.e(TAG, "read Yaml file: read error .", e)
            } finally {
                try {
                    input.close()
                } catch (e: IOException) {
                    e.printStackTrace()
                }
            }
            return list
        }
    
        fun readYamlFile(relativePath: String): List<*>? {
            var inputStream: InputStream? = null
            try {
                inputStream = InstrumentationRegistry.getContext().resources.assets.open(relativePath)
                return readYamlFile(inputStream)
            } catch (e: IOException) {
                e.printStackTrace()
            } finally {
                if (inputStream != null) {
                    try {
                        inputStream.close()
                    } catch (e1: IOException) {
                        e1.printStackTrace()
                    }
    
                }
            }
            return null
        }
    
        /**
         * 类型转换
         * @param clz
         * @param data
         * @return
         */
        fun castObject(clz: Class<*>, data: Any): Any {
            var data = data
            if (clz == Int::class.java) {
                return data as? Int ?: Integer.valueOf(data as String)
            }
            if (clz == String::class.java) {
                return data as? String ?: data.toString()
            }
            if (clz == Float::class.java) {
                data = data.toString()
                return java.lang.Float.valueOf(data)
            }
            if (clz == Double::class.java) {
                data = data.toString()
                return java.lang.Double.valueOf(data)
            }
            if (clz == Long::class.java) {
                data = data.toString()
                return java.lang.Long.valueOf(data)
            }
            if (clz == BigDecimal::class.java) {
                if (data is BigDecimal) return data
                data = data.toString()
                return BigDecimal(data)
            }
    
            println("没有合适的类型 : $clz")
            return data
        }
    }
    ```

1. 使用  
    首先添加数据文件资产：  
    新建名为 `assets` 的目录, 再新建 `test_data` 目录（该名称在代码中定义），
    然后是具体的数据文件（如 `login.yml`）  
    ![资产文件](/screenshot/espresso/ui04/paramsFile.jpg)  
    然后是数据文件的内容:  
    ![数据文件内容](/screenshot/espresso/ui04/dataFileContent.jpg)  
    注：`yml` 文件内容的格式必须严格遵循，否则将出现解析错误。文件中使用到的关键字
    则为 `YmlParametersProvider` 类中定义。  
    最后是测试中的使用:  
     ```java
    @Test
    @YmlParameters("login.yml")
    fun testLogin01(username: String, pwd: String ,toastMsg: String){
        val login = LoginView()
        login
                .doLogin(username ,pwd)
                .checkLoginError(toastMsg ,atr)
    }
    ```
    测试结果：  
    ![测试结果](/screenshot/espresso/ui04/testRes.jpg)  
### 五、后记  
遗留问题：会重复读取`yml`文件（每一个`@Test`的方法都会读取一次）。当然这也很好解决，
方案就自由发挥咯。  
由于各种原因，已有两月没有更新了，这次一次写完本系列吧。