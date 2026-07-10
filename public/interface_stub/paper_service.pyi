from typing import List, Dict, Any, Optional, Union

# 试卷管理模块接口契约（Python .pyi 存根）
# 对应 server.js 中 /api/papers 下的 REST API 路由
# 版本：1.1.0

PaperStatus = Union["draft", "published", "enabled", "disabled"]
PaperType = Union["fixed", "random"]
QuestionType = Union["single", "multiple", "judge", "fill", "essay"]

class PaperService:
    def list_papers(
        self,
        keyword: Optional[str] = None,
        category_id: Optional[Union[str, int]] = None,
        type: Optional[PaperType] = None
    ) -> Dict[str, Any]:
        """GET /api/papers
        返回试卷列表，支持按名称关键字、分类、出卷方式筛选。
        :raises ValueError: 参数格式非法
        """
        ...

    def get_paper(self, paper_id: Union[str, int]) -> Dict[str, Any]:
        """GET /api/papers/:id
        返回单个试卷详情。
        :raises FileNotFoundError: 试卷不存在
        """
        ...

    def create_paper(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """POST /api/papers
        创建试卷，自动填充缺失字段与默认分值。
        必填字段：name。
        可选字段：categoryId, categoryName, type, description, questions, totalScore,
                 duration, passScore, maxAttempts, shuffle, showAnswer, uniformScore, status。
        :raises ValueError: 必填字段缺失或格式非法
        """
        ...

    def update_paper(
        self,
        paper_id: Union[str, int],
        payload: Dict[str, Any]
    ) -> Dict[str, Any]:
        """PUT /api/papers/:id
        更新试卷信息，禁止修改 id 与 createdAt。
        :raises FileNotFoundError: 试卷不存在
        :raises ValueError: 更新字段非法
        """
        ...

    def delete_paper(self, paper_id: Union[str, int]) -> Dict[str, Any]:
        """DELETE /api/papers/:id
        删除试卷，级联清理题目图片并解除考试引用。
        :raises FileNotFoundError: 试卷不存在
        :raises RuntimeError: 删除失败
        """
        ...

    def migrate_local_papers(self, local_papers: List[Dict[str, Any]]) -> Dict[str, Any]:
        """内部调用（由前端 migratePapersIfNeeded 触发）
        将浏览器 localStorage 中的历史试卷批量迁移到后端。
        :returns: 迁移结果统计
        """
        ...

# 统一错误码契约（HTTP 状态码 + 业务码）
ERROR_CODES: Dict[str, Any] = {
    "PAPER_NOT_FOUND": (404, "试卷不存在"),
    "INVALID_PAPER_TYPE": (400, "出卷方式非法"),
    "MISSING_REQUIRED_FIELD": (422, "必填字段缺失"),
    "PAPER_NAME_EMPTY": (422, "试卷名称为必填项"),
    "DELETE_FAILED": (500, "删除失败"),
    "SAVE_FAILED": (500, "保存失败"),
    "UPDATE_FAILED": (500, "更新失败"),
}
