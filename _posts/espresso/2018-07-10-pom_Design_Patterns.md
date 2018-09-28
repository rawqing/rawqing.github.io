---
layout: post
title: '基于Espresso的Android UI自动化框架设计之三'
subtitle: '架构基础 -- POM设计模式'
date: 2018-07-10
author: 雨落寒霜
tags: espresso Android UI自动化 POM
---
> Page Object Model Design Pattern (页面对象模型设计模式) , 这种模型很大程度的
增强了方法的复用 , 使测试代码的可读性和层次感也得到了明显的优化.   

本系列项目位于`github:` [https://github.com/rawqing/EspressoBlackBoxDemo](https://github.com/rawqing/EspressoBlackBoxDemo)

POM 模式的基本理论这里就不讲了 , 大家课参考 [Design Patterns in Test Automation I](https://alexilyenko.github.io/patterns-1/)
 虽然不是说的`Espresso`,但基本原理都是一样的 .

### 一. 在此之前 
虽然 espresso 的api已经封装得很好了, 但为了更好的使用 , 我们还是需要对其进行二次封装.
1. 获取 `ActivityTestRule`  
    黑盒测试获取 `ActivityTestRule` 只有通过反射的方式 , 但也不能每一个测试类都
    使用 `Class.forName(className)` . 并且 `kotlin` 对泛型的要求比较严格 , so ,这里
    我们使用 `java` 进行反射封装:  
    ```java
   public static ActivityTestRule getActivityTestRule(String activityName) {
       return new ActivityTestRule(getFixedClass(activityName));
   }

   /**
    * 返回给定全类名的Class对象 (已处理异常)
    * @param className
    * @return
    */
   public static Class<?> getFixedClass(String className){
       try {
           return Class.forName(className);
       } catch (ClassNotFoundException e) {
           e.printStackTrace();
       }
       return null;
   }
    ```

2. 封装 `ViewElement`   
    这是对 `ViewInteraction` 的二次封装 (这里只示例简单封装)  
    ```java
   package yq.test.espressoblackboxdemo.expansions
   
   import android.support.test.espresso.Espresso.onView
   import android.support.test.espresso.ViewAssertion
   import android.support.test.espresso.ViewInteraction
   import android.support.test.espresso.action.ViewActions
   import android.support.test.espresso.matcher.RootMatchers
   import android.support.test.espresso.matcher.ViewMatchers.*
   import android.support.test.rule.ActivityTestRule
   import android.view.View
   import org.hamcrest.Matcher
   import org.hamcrest.Matchers
   import org.hamcrest.Matchers.allOf
   
   class ViewElement(
           private var id: String? = null,
   
           private var text: String? = null,
   
           private var isToast: Boolean = false,
   
           private var atr: ActivityTestRule<*>? = null,
   
           private var children: MutableList<ViewElement> = ArrayList()
   ) {
   
       private var interaction : ViewInteraction? = null
   
       /** View 查找部分 **/
   
       /**
        * 将 ViewElement 中的成员属性转换成 Matcher<View>
        *     这是关键的方法
        */
       private fun way(): Matcher<View> {
           val list = ArrayList<Matcher<View>>()
   
           id?.let { list.add(withResourceName(it)) }
           text?.let { list.add(withText(it)) }
           children.let { it.forEach {el-> list.add(withChild(el.way())) } }
   
           return allOf(list)
       }
   
       /**
        * 创建 ViewInteraction 实例 
        * 将区分 toast 和 普通 View
        */
       private fun createInteraction(): ViewInteraction? {
           if (interaction == null)
               interaction = if (isToast) {
                   onView(this.way())
                           .inRoot(RootMatchers.withDecorView(Matchers.not<View>(Matchers.`is`<View>(atr!!.activity.window.decorView))))
               } else {
                   onView(this.way())
               }
           return interaction
       }
   
       /** 二次封装部分 **/
   
       fun replaceText(text: String): ViewElement {
           this.createInteraction()?.perform(ViewActions.replaceText(text))
           return this
       }
   
       fun click(): ViewElement {
           this.createInteraction()?.perform(ViewActions.click())
           return this
       }
   
   
       fun check(viewAssertion: ViewAssertion): ViewElement {
           this.createInteraction()?.check(viewAssertion)
           return this
       }
   
       /** setter **/
   
       fun setId(id: String): ViewElement {
           this.id = id
           return this
       }
   
       fun setText(text: String): ViewElement {
           this.text = text
           return this
       }
   
       fun setChildren(vararg children: ViewElement): ViewElement {
           this.children = children.toMutableList()
           return this
       }
   
       fun beToast(isToast: Boolean): ViewElement {
           this.isToast = isToast
           return this
       }
   
       fun setActivityTestRule(atr: ActivityTestRule<*>?): ViewElement {
           this.atr = atr
           return this
       }
   }
    ```
    
### 二.分层设计  
先来看一下目录结构  
![目录结构](/screenshot/espresso/ui03/dirs.jpg)  
1. `View` 层 (Page Object)    
    ```java
    package yq.test.espressoblackboxdemo.views
    
    import android.support.test.espresso.assertion.ViewAssertions.matches
    import android.support.test.espresso.matcher.ViewMatchers.isDisplayed
    import android.support.test.rule.ActivityTestRule
    import yq.test.espressoblackboxdemo.expansions.ViewElement
    
    class LoginView {
    
        private val email = ViewElement().setId("email")
        private val password = ViewElement("password")
        private val loginBtn = ViewElement(id = "email_sign_in_button")
    
        /**
         * 执行登录
         */
        fun doLogin(emailText: String, pwd: String): LoginView {
            email.replaceText(emailText)
            password.replaceText(pwd)
            loginBtn.click()
    
            return this
        }
    
        /**
         * 检查登录错误时的错误提示
         */
        fun checkLoginError(toastMsg: String ,atr: ActivityTestRule<*>): LoginView {
            ViewElement(text = toastMsg, isToast = true ,atr = atr)
                    .check(matches(isDisplayed()))
             return this
        }
    }
    ```
    
    这里还嵌入了 `链式调用模式` . Page 中的每个方法都带上 `return this` ,当然
    如果是登录成功了 , 那么就应该 `return AccountView` 或者是其他登录成功后应当
    展示的 `Activity View` .  
    
2. `Tests` 层, 也就是具体的 `test case`   
    ```java
   package yq.test.espressoblackboxdemo.tests
   
   import android.support.test.runner.AndroidJUnit4
   import org.junit.Test
   import org.junit.runner.RunWith
   import org.junit.Rule
   import yq.test.espressoblackboxdemo.utils.UtilJ.getActivityTestRule
   import yq.test.espressoblackboxdemo.views.LoginView
   
   @RunWith(AndroidJUnit4::class)
   class LoginTest {
   
       @get:Rule
       var atr = getActivityTestRule("yq.test.logindemo.LoginActivity")
   
   
       @Test
       fun loginTest(){
           val login = LoginView()
           login
                   .doLogin("hello" ,"")
                   .checkLoginError("This email address is invalid" ,atr)
       }
   }

    ```   
3. 运行结果  
    ![运行结果](/screenshot/espresso/ui03/run_res.jpg)  

### 三. 总结      
POM 到这里就结束了 . 到目前, 我们总共也只分了两层(扩展 和 工具类不算在分层架构里面). 
    当然 , 还有 `data层` 我们目前还没有涉及 ,这将在后面的 `数据驱动` 章节讲述